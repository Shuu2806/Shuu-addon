import { world, system, EntityComponentTypes, type EntityInventoryComponent } from "@minecraft/server";

const BUNDLE_IDS = new Set([
  "minecraft:bundle",
  "minecraft:black_bundle",   "minecraft:blue_bundle",       "minecraft:brown_bundle",
  "minecraft:cyan_bundle",    "minecraft:gray_bundle",        "minecraft:green_bundle",
  "minecraft:light_blue_bundle", "minecraft:light_gray_bundle", "minecraft:lime_bundle",
  "minecraft:magenta_bundle", "minecraft:orange_bundle",      "minecraft:pink_bundle",
  "minecraft:purple_bundle",  "minecraft:red_bundle",         "minecraft:white_bundle",
  "minecraft:yellow_bundle",
]);

// Supprime les bundles présents dans l'inventaire toutes les 100 ticks
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
    if (!inv?.container) continue;
    for (let i = 0; i < inv.container.size; i++) {
      const item = inv.container.getItem(i);
      if (item && BUNDLE_IDS.has(item.typeId)) {
        inv.container.setItem(i, undefined);
        player.sendMessage("§cLes bundles sont interdits sur ce serveur.");
      }
    }
  }
}, 100);

// Bloque l'utilisation des bundles
world.beforeEvents.itemUse.subscribe((event) => {
  if (!BUNDLE_IDS.has(event.itemStack.typeId)) return;
  event.cancel = true;
});
