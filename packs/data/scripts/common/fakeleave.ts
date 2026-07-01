import {
  world,
  system,
  CommandPermissionLevel,
  CustomCommandStatus,
} from "@minecraft/server";

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:fakeleave",
      description: "Affiche un faux message de déconnexion dans le chat.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
    },
    (origin) => {
      system.run(() => {
        const player = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        if (!player) return;
        world.sendMessage(`§e${player.name} left the Realm`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
