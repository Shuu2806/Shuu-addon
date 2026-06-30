import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandStatus,
} from "@minecraft/server";
import { startTpChannel } from "./tp-channel.ts";

const BACK_KEY = "shuuaddons:backpos";

interface BackPoint {
  x: number;
  y: number;
  z: number;
  dim: string;
}

export function recordBackPosition(player: Player): void {
  const point: BackPoint = {
    x: player.location.x,
    y: player.location.y,
    z: player.location.z,
    dim: player.dimension.id,
  };
  player.setDynamicProperty(BACK_KEY, JSON.stringify(point));
}

world.afterEvents.entityDie.subscribe((event) => {
  const player = event.deadEntity;
  if (!(player instanceof Player)) return;
  recordBackPosition(player);
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:back",
      description: "Retourne à votre dernier emplacement (mort ou avant téléportation).",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!p) return;
        const raw = p.getDynamicProperty(BACK_KEY);
        if (typeof raw !== "string") { p.sendMessage("§cAucun emplacement précédent enregistré."); return; }
        const point = JSON.parse(raw) as BackPoint;
        startTpChannel(p, 5, (target) => {
          target.setDynamicProperty(BACK_KEY, undefined);
          const dim = world.getDimension(point.dim.replace("minecraft:", ""));
          target.teleport({ x: point.x, y: point.y, z: point.z }, { dimension: dim });
          target.sendMessage("§aRetour à votre emplacement précédent.");
        });
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
