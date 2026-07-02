import { world, system, Player, EntityComponentTypes, EntityInventoryComponent } from "@minecraft/server";
import { EXTRA_LIFE_ITEM, REVIVE_ITEM } from "./constants.ts";
import {
  getLives,
  setLives,
  eliminatePlayer,
  isEventModeActive,
  reviveFromSpectator,
  consumePendingLives,
} from "./helpers.ts";
import { openReviveForm } from "./forms.tsx";
import "./commands.ts";

world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  let lives = getLives(player);

  if (initialSpawn) {
    const pending = consumePendingLives(player.name);
    if (pending > 0) {
      lives += pending;
      player.sendMessage(
        `§a+${pending} vie(s) reçue(s) pendant votre absence ! Vous avez maintenant §c${lives}§a vie(s).`,
      );
    }
    setLives(player, lives);

    if (lives > 0) reviveFromSpectator(player);
  }

  if (lives <= 0) {
    eliminatePlayer(player);
  } else if (!initialSpawn) {
    player.onScreenDisplay.setActionBar(`§c${lives} vie(s) restante(s)`);
  }
});

world.afterEvents.entityDie.subscribe((event) => {
  const player = event.deadEntity;
  if (!(player instanceof Player)) return;
  if (isEventModeActive()) return;

  const lives = Math.max(getLives(player) - 1, 0);
  setLives(player, lives);

  if (lives <= 0) {
    player.sendMessage("§4§lC'était votre dernière vie...");
  } else {
    player.sendMessage(`§eIl vous reste §c${lives}§e vie(s).`);
  }
});

world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;

  if (itemStack.typeId === EXTRA_LIFE_ITEM) {
    const lives = getLives(player) + 1;
    setLives(player, lives);
    player.sendMessage(`§a+1 vie ! Vous avez maintenant §c${lives}§a vie(s).`);
    player.playSound("random.levelup");

    const inventory = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
    const slot = player.selectedSlotIndex;
    const item = inventory.container.getItem(slot);
    if (!item) return;
    if (item.amount > 1) {
      item.amount -= 1;
      inventory.container.setItem(slot, item);
    } else {
      inventory.container.setItem(slot, undefined);
    }
    return;
  }

  if (itemStack.typeId === REVIVE_ITEM) {
    system.run(async () => openReviveForm(player));
  }
});
