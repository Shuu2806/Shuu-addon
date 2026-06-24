import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";
import { SHOP_BLOCK, DISPLAY_ENTITY, SHOP_BLOCK as SHOP_ITEM, DEFAULT_NAME } from "./constants.ts";
import { isOwnerOrAdmin, isInOwnedClaim, getPlayerInv } from "./helpers.ts";
import { showEmptyShopOptions, showSellerOptionsForm, showBuyForm } from "./forms.ts";

const _interactCooldown = new Set<string>();

world.beforeEvents.playerInteractWithEntity.subscribe(ev => {
  if (ev.target.typeId !== DISPLAY_ENTITY) return;
  ev.cancel = true;
  const { player, target } = ev;

  if (_interactCooldown.has(player.name)) return;
  _interactCooldown.add(player.name);
  system.runTimeout(() => _interactCooldown.delete(player.name), 5);

  system.run(async () => {
    const hasItem = target.getDynamicProperty("itemForSale");

    if (!hasItem) {
      if (isOwnerOrAdmin(player, target)) await showEmptyShopOptions(player, target);
      else player.sendMessage("§7Ce shop n'est pas encore configuré.");
    } else if (isOwnerOrAdmin(player, target)) {
      await showSellerOptionsForm(player, target);
    } else {
      await showBuyForm(player, target);
    }
  });
});

world.afterEvents.playerPlaceBlock.subscribe(ev => {
  if (ev.block.typeId !== SHOP_BLOCK) return;
  const { player, block, dimension } = ev;

  if (!player.hasTag("admin") && !isInOwnedClaim(player.name, block.x, block.z)) {
    system.run(() => {
      block.setPermutation(BlockPermutation.resolve("minecraft:air"));
      const inv = getPlayerInv(player);
      if (inv) inv.addItem(new ItemStack(SHOP_ITEM, 1));
      player.sendMessage("§cVous ne pouvez poser un shop que dans votre propre claim.");
    });
    return;
  }

  const dir    = block.permutation.getState("minecraft:cardinal_direction") as string;
  const rotMap: Record<string, number> = { north: 180, south: 0, east: 270, west: 90 };
  const rot    = rotMap[dir] ?? 0;
  const x = block.x + 0.5, y = block.y, z = block.z + 0.5;

  dimension.runCommand(`summon ${DISPLAY_ENTITY} ${x} ${y} ${z} ${rot} ~ none "${DEFAULT_NAME}"`);

  system.runTimeout(() => {
    const entities = dimension.getEntities({ location: { x, y, z }, maxDistance: 1, type: DISPLAY_ENTITY });
    for (const e of entities) {
      if (!e.getDynamicProperty("placedBy")) {
        e.setDynamicProperty("placedBy", player.name);
        player.sendMessage("§aShop créé ! Cliquez dessus pour le configurer.");
        break;
      }
    }
  }, 5);
});
