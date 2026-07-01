import { world } from "@minecraft/server";

world.beforeEvents.explosion.subscribe((ev) => {
  if (ev.source?.typeId !== "minecraft:creeper") return;
  ev.setImpactedBlocks([]);
});
