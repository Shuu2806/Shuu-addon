import { world, system, Player, EntityComponentTypes, type EntityInventoryComponent } from "@minecraft/server";
import { addBalance, fmtNC } from "~/common/economy.ts";
import { getLives } from "~/life/helpers.ts";
import { onFishCaught } from "~/common/fishing_detection.ts";
import { JOB_META, type JobKey } from "./constants.ts";
import {
  getJobData, grantReward, getDefaultReward, getCustomJobReward,
  hasCasserReward, SMELT_ITEMS,
  getSalaryAmount, getSalaryMinutes, syncAllScoreboards,
  claimPendingBoost,
} from "./helpers.ts";
import "./commands.ts";

// ── Anti-exploit : blocs posés par un joueur ──────────────────────────────────

const placedByPlayer = new Set<string>();

function isTrackable(typeId: string): boolean {
  return typeId.includes("_ore") ||
    typeId === "minecraft:ancient_debris" ||
    typeId.includes("_log") ||
    typeId === "minecraft:bamboo_block" ||
    typeId === "minecraft:reeds" ||
    typeId === "minecraft:bamboo";
}

world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const tid = ev.block.typeId;
  if (isTrackable(tid) || hasCasserReward(tid))
    placedByPlayer.add(`${ev.block.x},${ev.block.y},${ev.block.z}`);
});

// ── Piston : marquer les blocs déplacés ──────────────────────────────────────

world.afterEvents.pistonActivate.subscribe((ev) => {
  const facing = (ev.block.permutation.getState("facing_direction" as never) as unknown as number) ?? 0;
  const dirs: [number, number, number][] = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
  const [dx, dy, dz] = dirs[facing] ?? [0, 0, 0];
  for (const block of ev.piston.getAttachedBlocks()) {
    placedByPlayer.add(`${block.x},${block.y},${block.z}`);
    placedByPlayer.add(`${block.x + dx},${block.y + dy},${block.z + dz}`);
    placedByPlayer.add(`${block.x - dx},${block.y - dy},${block.z - dz}`);
  }
});

// ── Chasseur ─────────────────────────────────────────────────────────────────

world.afterEvents.entityDie.subscribe((ev) => {
  const { deadEntity, damageSource } = ev;
  if (deadEntity.typeId === "minecraft:player") return;
  const attacker = damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player") return;
  const customR = getCustomJobReward("hunter", deadEntity.typeId);
  const reward = (customR?.category === "tuer" ? customR : null) ?? getDefaultReward("hunter", "tuer", deadEntity.typeId);
  if (!reward) return;
  const player = attacker as unknown as Player;
  system.run(() => grantReward(player, "hunter", reward, deadEntity.typeId));
});

// ── Bucheron ──────────────────────────────────────────────────────────────────

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const tid = ev.brokenBlockPermutation?.type?.id ?? "";
  const customR = getCustomJobReward("lumberjack", tid);
  const r = (customR?.category === "casser" ? customR : null) ?? getDefaultReward("lumberjack", "casser", tid);
  if (!r) return;
  const key = `${ev.block.x},${ev.block.y},${ev.block.z}`;
  if (placedByPlayer.has(key)) { placedByPlayer.delete(key); return; }
  system.run(() => grantReward(ev.player, "lumberjack", r, tid));
});

// ── Mineur ────────────────────────────────────────────────────────────────────

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const tid = ev.brokenBlockPermutation?.type?.id ?? "";
  const customR = getCustomJobReward("miner", tid);
  const reward = (customR?.category === "casser" ? customR : null) ?? getDefaultReward("miner", "casser", tid);
  if (!reward) return;
  const key = `${ev.block.x},${ev.block.y},${ev.block.z}`;
  if (placedByPlayer.has(key)) { placedByPlayer.delete(key); return; }
  system.run(() => grantReward(ev.player, "miner", reward, tid));
});

// ── Fermier ───────────────────────────────────────────────────────────────────

// Quand le 2e bloc de canne à sucre est cassé, le 3e tombe sans déclencher
// playerBreakBlock. On détecte la présence du 3e avant la casse (beforeEvent)
// puis on accorde le bonus dans l'afterEvent.
const sugarcaneBonusPending = new Map<string, { xp: number; nc: number }>();

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (ev.block.typeId !== "minecraft:reeds") return;
  const { x, y, z } = ev.block;
  // 2e bloc : reeds en dessous
  const below = ev.player.dimension.getBlock({ x, y: y - 1, z });
  if (below?.typeId !== "minecraft:reeds") return;
  // 3e bloc : reeds au dessus
  const above = ev.player.dimension.getBlock({ x, y: y + 1, z });
  if (above?.typeId !== "minecraft:reeds") return;
  // Le 3e bloc ne doit pas avoir été posé par le joueur
  if (placedByPlayer.has(`${x},${y + 1},${z}`)) return;
  // Le 2e bloc ne doit pas avoir été posé par le joueur
  if (placedByPlayer.has(`${x},${y},${z}`)) return;
  const customR = getCustomJobReward("farmer", "minecraft:reeds");
  const reward = (customR?.category === "casser" ? customR : null)
    ?? getDefaultReward("farmer", "casser", "minecraft:reeds");
  if (reward) sugarcaneBonusPending.set(ev.player.id, reward);
});

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const tid = ev.brokenBlockPermutation?.type?.id ?? "";
  const customR = getCustomJobReward("farmer", tid);
  const reward = (customR?.category === "casser" ? customR : null)
    ?? getDefaultReward("farmer", "casser", tid, ev.brokenBlockPermutation);
  const key = `${ev.block.x},${ev.block.y},${ev.block.z}`;
  const bonus = tid === "minecraft:reeds" ? sugarcaneBonusPending.get(ev.player.id) : undefined;
  if (bonus) sugarcaneBonusPending.delete(ev.player.id);
  if (!reward) return;
  if (placedByPlayer.has(key)) { placedByPlayer.delete(key); return; }
  system.run(() => {
    grantReward(ev.player, "farmer", reward, tid);
    if (bonus) grantReward(ev.player, "farmer", bonus, tid);
  });
});

// ── Pêcheur : récompense sur l'item réellement identifié ────────────────────────
// L'ancienne détection (fenêtre fixe de 20s après le lancer + diff d'inventaire)
// ratait les touches lentes, se corrompait dès que la canne elle-même changeait
// de slot, ET était exploitable : n'importe quel item "pêchable" gagné pendant la
// fenêtre (ramassé au sol, pris dans un coffre à côté) déclenchait la récompense,
// peu importe s'il venait vraiment de la pêche. common/fishing_detection.ts
// identifie maintenant l'item exact via l'entité de loot que le hameçon vanilla
// fait spawn au moment de la prise (composant "minecraft:loot") — on récompense
// cet item précis, jamais un diff d'inventaire générique.

// DEBUG temporaire — cf. common/fishing_detection.ts pour le même mécanisme côté détection.
// const DEBUG_PLAYER_NAME = "Shuu2806";
function debugMsg(_text: string) {
  // world.getAllPlayers().find((p) => p.name === DEBUG_PLAYER_NAME)?.sendMessage(`§7[FishDebug] §f${_text}`);
}

onFishCaught(({ player, item }) => {
  if (!item) {
    debugMsg(`[5] onFishCaught reçu mais item NON IDENTIFIÉ — aucune récompense — ${player.name}`);
    return;
  }
  debugMsg(`[5] onFishCaught reçu — item=${item.typeId} x${item.amount} — ${player.name}`);

  const customR = getCustomJobReward("fisher", item.typeId);
  const reward = (customR?.category === "pecher" ? customR : null) ?? getDefaultReward("fisher", "pecher", item.typeId);
  if (!reward) {
    debugMsg(`[6] item pêché (${item.typeId}) mais AUCUNE config de reward trouvée — ${player.name}`);
    return;
  }
  debugMsg(`[7] récompense accordée pour ${item.typeId} (xp=${reward.xp}, nc=${reward.nc}) — ${player.name}`);
  grantReward(player, "fisher", reward, item.typeId, item.amount);
});

// ── Four : XP de cuisson liée à la session d'ouverture du four lui-même ───────
// L'ancienne détection (changement d'inventaire + fenêtre de temps, avec ou
// sans check de proximité) accordait l'XP dès qu'un item du bon type
// apparaissait dans l'inventaire, peu importe sa provenance (un lingot pris
// dans un coffre proche comptait comme une sortie de four). On utilise ici les
// events dédiés blockContainerOpened/Closed : on photographie l'inventaire du
// joueur à l'ouverture de CE four précis, puis on compare à la fermeture. Seuls
// les items réellement récupérés pendant cette session sont récompensés —
// aucune dépendance à la lecture du contenu du four (pas toujours exposée par
// l'API) ni à un minuteur qui peut expirer trop tôt.

const FURNACE_TYPES = new Set([
  "minecraft:furnace", "minecraft:lit_furnace",
  "minecraft:blast_furnace", "minecraft:lit_blast_furnace",
  "minecraft:smoker", "minecraft:lit_smoker",
]);

function snapshotInventory(player: Player): Map<string, number> {
  const counts = new Map<string, number>();
  const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
  const container = inv?.container;
  if (!container) return counts;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (!item) continue;
    counts.set(item.typeId, (counts.get(item.typeId) ?? 0) + item.amount);
  }
  return counts;
}

const furnaceOpenSnapshots = new Map<string, Map<string, number>>();

world.afterEvents.blockContainerOpened.subscribe((ev) => {
  if (!FURNACE_TYPES.has(ev.block.typeId)) return;
  const player = ev.openSource.entity;
  if (!(player instanceof Player)) return;
  furnaceOpenSnapshots.set(player.id, snapshotInventory(player));
});

world.afterEvents.blockContainerClosed.subscribe((ev) => {
  if (!FURNACE_TYPES.has(ev.block.typeId)) return;
  const player = ev.closeSource.entity;
  if (!(player instanceof Player)) return;
  const before = furnaceOpenSnapshots.get(player.id);
  furnaceOpenSnapshots.delete(player.id);
  if (!before) return;

  system.run(() => {
    const after = snapshotInventory(player);
    for (const [typeId, afterCount] of after) {
      const gained = afterCount - (before.get(typeId) ?? 0);
      if (gained <= 0) continue;

      const smeltCustom = getCustomJobReward("miner", typeId);
      const smeltReward = (smeltCustom?.category === "cuire" ? smeltCustom : null)
        ?? (SMELT_ITEMS.has(typeId) ? getDefaultReward("miner", "cuire", typeId) : null);
      if (smeltReward) grantReward(player, "miner", smeltReward, typeId, gained);

      const fishCuireCustom = getCustomJobReward("fisher", typeId);
      if (fishCuireCustom?.category === "cuire") grantReward(player, "fisher", fishCuireCustom, typeId, gained);
    }
  });
});

world.afterEvents.playerLeave.subscribe((ev) => {
  furnaceOpenSnapshots.delete(ev.playerId);
  sugarcaneBonusPending.delete(ev.playerId);
});

// ── Salaire périodique ────────────────────────────────────────────────────────

const LAST_SALARY_KEY = "shuuaddons:lastsalary";

function getLastSalaryTime(): number {
  const raw = world.getDynamicProperty(LAST_SALARY_KEY);
  // 0 (et non Date.now()) : sinon "jamais payé" se traduit par un écart nul,
  // qui ne dépasse jamais intervalMs et empêche à jamais le tout premier
  // paiement (et donc l'initialisation de la propriété elle-même).
  return typeof raw === "number" ? raw : 0;
}

system.runInterval(() => {
  const intervalMs = getSalaryMinutes() * 60_000;
  if (Date.now() - getLastSalaryTime() < intervalMs) return;
  world.setDynamicProperty(LAST_SALARY_KEY, Date.now());

  for (const player of world.getAllPlayers()) {
    if (getLives(player) <= 0) continue;
    const data = getJobData(player);
    if (data.active.length === 0) continue;
    let total = 0;
    const lines: string[] = [];
    for (const job of data.active) {
      const e = data.jobs[job as JobKey];
      const lvl = e?.lvl ?? 0;
      const amount = getSalaryAmount(job as JobKey, lvl);
      total += amount;
      lines.push(`${JOB_META[job as JobKey].color}${JOB_META[job as JobKey].label} §7Niv ${lvl} §8→ §e+${fmtNC(amount)}`);
    }
    if (total > 0) {
      addBalance(player, total);
      player.sendMessage(`§6[Salaire] §ePaiement de §f${fmtNC(total)}§e !\n${lines.join("\n")}`);
    }
  }
}, 100);

// ── Sync scoreboard à la connexion ────────────────────────────────────────────

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  system.run(() => {
    syncAllScoreboards(ev.player);
    claimPendingBoost(ev.player);
  });
});
