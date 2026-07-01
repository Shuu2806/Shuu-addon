import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";
import { recordBackPosition } from "./back.ts";
import { startTpChannel } from "./tp-channel.ts";

const SPAWN_KEY = "shuuaddons:worldspawn";
const TPA_TIMEOUT_TICKS = 60 * 20;

interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  dim: string;
}

function getSpawn(): SpawnPoint | null {
  const raw = world.getDynamicProperty(SPAWN_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as SpawnPoint) : null;
}

function teleportTo(player: Player, point: SpawnPoint): void {
  const dim = world.getDimension(point.dim.replace("minecraft:", ""));
  player.teleport({ x: point.x, y: point.y, z: point.z }, { dimension: dim });
}

// ── /shuuaddons:setspawn ──────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:setspawn",
      description: "Définit le spawn du serveur à votre position actuelle.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
    },
    (origin) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!p) return;
        const point: SpawnPoint = { x: p.location.x, y: p.location.y, z: p.location.z, dim: p.dimension.id };
        world.setDynamicProperty(SPAWN_KEY, JSON.stringify(point));
        p.sendMessage("§aSpawn défini à votre position actuelle.");
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:spawn ─────────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:spawn",
      description: "Téléporte au spawn du serveur.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!p) return;
        const point = getSpawn();
        if (!point) { p.sendMessage("§cAucun spawn n'a été défini."); return; }
        startTpChannel(p, 5, (target) => {
          recordBackPosition(target);
          teleportTo(target, point);
          target.sendMessage("§aTéléporté au spawn !");
        });
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:tpa / tpaccept / tpreject ─────────────────────────────────────

interface PendingTp {
  id: number;
  fromId: string;
  fromName: string;
  expireTick: number;
}

const pendingTpRequests = new Map<string, PendingTp>();
let tpRequestCounter = 0;

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:tpa",
      description: "Demande à vous téléporter vers un joueur.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "joueur", type: CustomCommandParamType.String }],
    },
    (origin, joueurName: string) => {
      system.run(() => {
        const sender = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!sender) return;
        const joueur = world.getAllPlayers().find((x) => x.name === joueurName);
        if (!joueur) { sender.sendMessage("§cCe joueur n'est pas connecté."); return; }
        if (joueur.id === sender.id) { sender.sendMessage("§cVous ne pouvez pas vous téléporter vers vous-même."); return; }
        const requestId = ++tpRequestCounter;
        const targetId  = joueur.id;
        const fromId    = sender.id;
        pendingTpRequests.set(targetId, {
          id: requestId,
          fromId,
          fromName: sender.name,
          expireTick: system.currentTick + TPA_TIMEOUT_TICKS,
        });
        sender.sendMessage(`§aDemande de téléportation envoyée à §e${joueur.name}§a. §7(expire dans 60s)`);
        joueur.sendMessage(`§e${sender.name} §asouhaite se téléporter vers vous. §7/tpaccept §aou §7/tpreject§a §7(60s)`);
        system.runTimeout(() => {
          const current = pendingTpRequests.get(targetId);
          if (!current || current.id !== requestId) return;
          pendingTpRequests.delete(targetId);
          world.getAllPlayers().find((x) => x.id === targetId)
            ?.sendMessage("§cLa demande de téléportation a expiré.");
          world.getAllPlayers().find((x) => x.id === fromId)
            ?.sendMessage("§cVotre demande de téléportation n'a pas été acceptée.");
        }, TPA_TIMEOUT_TICKS);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:tpaccept",
      description: "Accepte une demande de téléportation.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      system.run(() => {
        const target = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!target) return;
        const req = pendingTpRequests.get(target.id);
        if (!req || req.expireTick < system.currentTick) {
          pendingTpRequests.delete(target.id);
          target.sendMessage("§cAucune demande de téléportation en attente.");
          return;
        }
        pendingTpRequests.delete(target.id);
        const requester = world.getAllPlayers().find((x) => x.id === req.fromId);
        if (!requester) { target.sendMessage("§cLe joueur n'est plus en ligne."); return; }
        target.sendMessage(`§aVous avez accepté la demande de §e${requester.name}§a.`);
        requester.sendMessage(`§e${target.name} §aa accepté votre demande.`);
        startTpChannel(requester, 5, (p) => {
          const dest = world.getAllPlayers().find((x) => x.id === target.id);
          if (!dest) { p.sendMessage("§cLe joueur n'est plus en ligne."); return; }
          recordBackPosition(p);
          teleportTo(p, { x: dest.location.x, y: dest.location.y, z: dest.location.z, dim: dest.dimension.id });
          p.sendMessage(`§aTéléporté vers §e${dest.name}§a !`);
        });
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:tpreject",
      description: "Refuse une demande de téléportation.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      system.run(() => {
        const target = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!target) return;
        const req = pendingTpRequests.get(target.id);
        if (!req) { target.sendMessage("§cAucune demande de téléportation en attente."); return; }
        pendingTpRequests.delete(target.id);
        target.sendMessage("§cDemande de téléportation refusée.");
        world.getAllPlayers().find((x) => x.id === req.fromId)
          ?.sendMessage(`§c${target.name} a refusé votre demande de téléportation.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

world.afterEvents.playerLeave.subscribe((ev) => {
  pendingTpRequests.delete(ev.playerId);
  for (const [targetId, req] of pendingTpRequests) {
    if (req.fromId === ev.playerId) pendingTpRequests.delete(targetId);
  }
});
