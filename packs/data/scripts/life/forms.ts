import { world, Player, EntityComponentTypes, EntityInventoryComponent } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { REVIVE_ITEM } from "./constants.ts";
import { getLives, setLives, reviveFromSpectator } from "./helpers.ts";
import { showFormWithRetry } from "~/common/form-utils.ts";
import { showConfirmForm } from "~/common/confirm.ts";

function consumeReviveItem(player: Player): void {
  const inventory = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
  const slot = player.selectedSlotIndex;
  const item = inventory.container.getItem(slot);
  if (!item || item.typeId !== REVIVE_ITEM) return;
  if (item.amount > 1) {
    item.amount -= 1;
    inventory.container.setItem(slot, item);
  } else {
    inventory.container.setItem(slot, undefined);
  }
}

export async function openReviveForm(player: Player): Promise<void> {
  const deadPlayers = world.getAllPlayers().filter((p) => getLives(p) <= 0);

  if (deadPlayers.length === 0) {
    player.sendMessage("§cAucun joueur n'a besoin d'être réanimé.");
    return;
  }

  const form = new ActionFormData()
    .title("§f§lRésurrection§r§4§1")
    .body("Choisissez un joueur à ressusciter :");

  for (const dead of deadPlayers) {
    form.button(`§c${dead.name}`);
  }

  while (true) {
    const response = await showFormWithRetry(form, player);
    if (response.canceled || response.selection === undefined) return;

    const target = deadPlayers[response.selection];
    if (!target?.isValid) {
      player.sendMessage("§cCe joueur n'est plus disponible.");
      return;
    }

    const confirmed = await showConfirmForm(
      player,
      `Voulez-vous réanimer §e${target.name}§r ?`
    );
    if (!confirmed) continue;

    const lives = getLives(target) + 1;
    setLives(target, lives);
    reviveFromSpectator(target);
    consumeReviveItem(player);

    target.sendMessage(`§aVous avez été réanimé par §e${player.name}§a ! Vous avez maintenant §c${lives}§a vie(s).`);
    player.sendMessage(`§aVous avez réanimé §e${target.name}§a !`);
    return;
  }
}