import {
  world,
  system,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";

const BANS_KEY = "shuuaddons:bans";

function getBans(): string[] {
  const raw = world.getDynamicProperty(BANS_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
}

function setBans(list: string[]): void {
  world.setDynamicProperty(BANS_KEY, JSON.stringify(list));
}

function isBanned(name: string): boolean {
  return getBans().includes(name);
}

function kickPlayer(name: string, reason: string): void {
  world.getDimension("overworld").runCommand(`kick "${name}" ${reason}`);
}

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  system.run(() => {
    if (!isBanned(ev.player.name)) return;
    kickPlayer(ev.player.name, "Vous etes banni du serveur.");
  });
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:ban",
      description: "Bannit un joueur et le kick s'il est connecte.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "joueur", type: CustomCommandParamType.String }],
      optionalParameters: [{ name: "raison", type: CustomCommandParamType.String }],
    },
    (origin, joueur: string, raison?: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        const bans = getBans();
        if (bans.includes(joueur)) { admin?.sendMessage(`§c${joueur} est déjà banni.`); return; }
        bans.push(joueur);
        setBans(bans);
        const reason = raison ?? "Vous etes banni du serveur.";
        admin?.sendMessage(`§a${joueur} a été banni.`);
        world.sendMessage(`§c${joueur} a été banni du serveur.`);
        const target = world.getAllPlayers().find((x) => x.name === joueur);
        if (target) kickPlayer(joueur, reason);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:unban",
      description: "Débannit un joueur.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "joueur", type: CustomCommandParamType.String }],
    },
    (origin, joueur: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        const bans = getBans();
        if (!bans.includes(joueur)) { admin?.sendMessage(`§c${joueur} n'est pas banni.`); return; }
        setBans(bans.filter((n) => n !== joueur));
        admin?.sendMessage(`§a${joueur} a été débanni.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:banlist",
      description: "Affiche la liste des joueurs bannis.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
    },
    (origin) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!admin) return;
        const bans = getBans();
        if (bans.length === 0) { admin.sendMessage("§7Aucun joueur banni."); return; }
        admin.sendMessage(`§c=== Bannis (${bans.length}) ===\n${bans.map((n) => `§f${n}`).join("\n")}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
