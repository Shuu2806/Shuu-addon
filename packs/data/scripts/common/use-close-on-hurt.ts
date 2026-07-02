import { world, type Player } from "@minecraft/server";
import { useEvent } from "@bedrock-core/ui";

export function useCloseOnHurt(player: Player, exit: () => void): void {
  useEvent(world.afterEvents.entityHurt, (ev) => {
    if (ev.hurtEntity.id === player.id) exit();
  });
}
