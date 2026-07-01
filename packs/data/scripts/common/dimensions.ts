import {
  world,
  system,
  CommandPermissionLevel,
  CustomCommandStatus,
} from "@minecraft/server";

const NETHER_BLOCKED = "shuuaddons:netherBlocked";
const END_BLOCKED = "shuuaddons:endBlocked";

function isNetherBlocked(): boolean {
  return world.getDynamicProperty(NETHER_BLOCKED) !== false;
}

function isEndBlocked(): boolean {
  return world.getDynamicProperty(END_BLOCKED) !== false;
}

export function setNetherBlocked(value: boolean): void {
  world.setDynamicProperty(NETHER_BLOCKED, value);
}

export function setEndBlocked(value: boolean): void {
  world.setDynamicProperty(END_BLOCKED, value);
}

world.afterEvents.playerDimensionChange.subscribe((event) => {
  const { player, toDimension, fromDimension, fromLocation } = event;
  if (player.hasTag("admin")) return;

  const blocked =
    (toDimension.id === "minecraft:nether" && isNetherBlocked()) ||
    (toDimension.id === "minecraft:the_end" && isEndBlocked());

  if (!blocked) return;

  system.run(() => {
    const name = toDimension.id === "minecraft:nether" ? "Nether" : "End";
    if (toDimension.id === "minecraft:the_end") {
      const spawn = player.getSpawnPoint();
      if (spawn) {
        player.teleport(spawn, { dimension: spawn.dimension });
      } else {
        player.teleport({ x: -9, y: 73, z: 1 }, { dimension: world.getDimension("overworld") });
      }
    } else {
      player.teleport(fromLocation, { dimension: fromDimension });
    }
    player.sendMessage(`§cL'acces au ${name} est actuellement bloque.`);
  });
});

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:togglenether",
      description: "Active ou desactive l'acces au Nether.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
    },
    (_origin) => {
      system.run(() => {
        const newState = !isNetherBlocked();
        world.setDynamicProperty(NETHER_BLOCKED, newState);
        world.sendMessage(
          newState
            ? "§c[Nether] Acces bloque."
            : "§a[Nether] Acces ouvert.",
        );
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:toggleend",
      description: "Active ou desactive l'acces a l'End.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
    },
    (_origin) => {
      system.run(() => {
        const newState = !isEndBlocked();
        world.setDynamicProperty(END_BLOCKED, newState);
        world.sendMessage(
          newState
            ? "§c[End] Acces bloque."
            : "§a[End] Acces ouvert.",
        );
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
