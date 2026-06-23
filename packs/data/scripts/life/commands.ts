import {
  system,
  world,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";
import { GAME_OVER_ACTION_ENUM, type GameOverAction } from "./constants.ts";
import {
  getLives,
  setLives,
  setGameOverAction,
  addPendingLives,
  isEventModeActive,
  reviveFromSpectator,
  eliminatePlayer,
} from "./helpers.ts";

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerEnum(GAME_OVER_ACTION_ENUM, ["spectator", "kick"]);

  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:setgameoveraction",
      description: "Définit la sanction appliquée aux joueurs sans vie : mode spectateur ou expulsion.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: GAME_OVER_ACTION_ENUM, type: CustomCommandParamType.Enum }],
    },
    (_origin, action: GameOverAction) => {
      system.run(() => {
        setGameOverAction(action);
        for (const player of world.getAllPlayers()) {
          if (getLives(player) <= 0) eliminatePlayer(player);
        }
      });
      return {
        status: CustomCommandStatus.Success,
        message:
          action === "kick"
            ? "§aLes joueurs sans vie seront désormais expulsés."
            : "§aLes joueurs sans vie seront désormais mis en mode spectateur.",
      };
    },
  );
});

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:givelife",
      description: "Donne une ou plusieurs vies supplémentaires à un joueur, même hors ligne.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "playerName", type: CustomCommandParamType.String }],
      optionalParameters: [{ name: "amount", type: CustomCommandParamType.Integer }],
    },
    (_origin, playerName: string, amount?: number) => {
      const lifeCount = amount ?? 1;

      if (lifeCount <= 0) {
        return { status: CustomCommandStatus.Failure, message: "§cLe nombre de vies doit être supérieur à 0." };
      }

      system.run(() => {
        const player = world.getAllPlayers().find((p) => p.name === playerName);
        if (!player) {
          addPendingLives(playerName, lifeCount);
          return;
        }

        const lives = getLives(player) + lifeCount;
        setLives(player, lives);
        player.sendMessage(`§a+${lifeCount} vie(s) ! Vous avez maintenant §c${lives}§a vie(s).`);
        if (lives > 0) reviveFromSpectator(player);
      });

      return { status: CustomCommandStatus.Success, message: `§aVie(s) données à ${playerName}.` };
    },
  );
});

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:toggleevent",
      description: "Active ou désactive le mode event : les joueurs ne perdent pas de vie.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
    },
    (_origin) => {
      system.run(() => {
        const newState = !isEventModeActive();
        world.setDynamicProperty("shuuaddons:eventMode", newState);
        world.sendMessage(
          newState
            ? "§6[Event] §aMode event activé : les joueurs ne perdent plus de vie."
            : "§6[Event] §cMode event désactivé : la perte de vie est rétablie.",
        );
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
