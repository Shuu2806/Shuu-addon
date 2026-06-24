import { world, system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { showHologramMenu } from "./forms.ts";

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:hologram",
      description: "Gérer les hologrammes.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
    },
    (origin) => {
      system.run(async () => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (p) await showHologramMenu(p);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
