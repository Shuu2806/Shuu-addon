import { world, system, Player } from "@minecraft/server";

const AFK_TIMEOUT_MS = 3 * 60 * 1000;
const WARNING_MS = 15 * 1000;
const CHECK_INTERVAL_TICKS = 20;
const MOVE_THRESHOLD = 0.1;
const ROT_THRESHOLD = 1;

interface ActivityState {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  lastActive: number;
}

const activity = new Map<string, ActivityState>();

function markActive(player: Player): void {
  const loc = player.location;
  const rot = player.getRotation();
  activity.set(player.id, { x: loc.x, y: loc.y, z: loc.z, rotX: rot.x, rotY: rot.y, lastActive: Date.now() });
}

world.afterEvents.playerSpawn.subscribe(({ player }) => markActive(player));
world.afterEvents.playerBreakBlock.subscribe((ev) => markActive(ev.player));
world.afterEvents.itemUse.subscribe((ev) => markActive(ev.source));
world.afterEvents.entityHitEntity.subscribe((ev) => {
  if (ev.damagingEntity instanceof Player) markActive(ev.damagingEntity);
});

world.afterEvents.playerLeave.subscribe((ev) => activity.delete(ev.playerId));

// Kick les joueurs immobiles (position + rotation inchangées) depuis 3 minutes,
// avec une alerte sonore et un message dans les 15 dernières secondes.
system.runInterval(() => {
  const now = Date.now();
  for (const player of world.getAllPlayers()) {
    const state = activity.get(player.id);
    if (!state) {
      markActive(player);
      continue;
    }

    const loc = player.location;
    const rot = player.getRotation();
    const moved =
      Math.abs(loc.x - state.x) > MOVE_THRESHOLD ||
      Math.abs(loc.y - state.y) > MOVE_THRESHOLD ||
      Math.abs(loc.z - state.z) > MOVE_THRESHOLD ||
      Math.abs(rot.x - state.rotX) > ROT_THRESHOLD ||
      Math.abs(rot.y - state.rotY) > ROT_THRESHOLD;

    if (moved) {
      markActive(player);
      continue;
    }

    const elapsed = now - state.lastActive;

    if (elapsed >= AFK_TIMEOUT_MS) {
      player.runCommand(`kick "${player.name}" §eDeconnecte pour inactivite (3 minutes).`);
      activity.delete(player.id);
      continue;
    }

    if (elapsed >= AFK_TIMEOUT_MS - WARNING_MS) {
      const remaining = Math.ceil((AFK_TIMEOUT_MS - elapsed) / 1000);
      player.onScreenDisplay.setActionBar(`§c§lInactif ! Déconnexion dans §f${remaining}s§c...`);
      player.playSound("random.orb");
    }
  }
}, CHECK_INTERVAL_TICKS);
