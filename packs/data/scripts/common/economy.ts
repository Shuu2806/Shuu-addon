import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";

const ECONOMY_KEY = "shuuaddons:eco";

export function getBalance(player: Player): number {
  const v = player.getDynamicProperty(ECONOMY_KEY);
  return typeof v === "number" ? v : 0;
}

export function setBalance(player: Player, n: number): void {
  player.setDynamicProperty(ECONOMY_KEY, Math.max(0, Math.floor(n)));
}

export function addBalance(player: Player, n: number): void {
  setBalance(player, getBalance(player) + n);
}

export function removeBalance(player: Player, n: number): boolean {
  const cur = getBalance(player);
  if (cur < n) return false;
  setBalance(player, cur - n);
  return true;
}

export function fmtNC(n: number): string {
  const s = Math.floor(n).toString();
  let r = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) r += " ";
    r += s[i];
  }
  return r + " NC";
}

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:balance",
      description: "Affiche votre solde en Nonocoins.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!p) return;
        p.sendMessage(`§6Votre solde : §e${fmtNC(getBalance(p))}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:pay",
      description: "Envoie des Nonocoins à un joueur.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "joueur", type: CustomCommandParamType.String },
        { name: "montant", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, joueur: string, montant: number) => {
      system.run(() => {
        const sender = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!sender) return;
        if (montant <= 0) { sender.sendMessage("§cLe montant doit être positif."); return; }
        const target = world.getAllPlayers().find((x) => x.name === joueur);
        if (!target) { sender.sendMessage(`§cJoueur "${joueur}" introuvable (doit être en ligne).`); return; }
        if (target.id === sender.id) { sender.sendMessage("§cVous ne pouvez pas vous payer vous-même."); return; }
        if (!removeBalance(sender, montant)) { sender.sendMessage("§cSolde insuffisant."); return; }
        addBalance(target, montant);
        sender.sendMessage(`§aVous avez envoyé §e${fmtNC(montant)} §aà §e${target.name}§a.`);
        target.sendMessage(`§aVous avez reçu §e${fmtNC(montant)} §ade §e${sender.name}§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:givemoney",
      description: "Donne des Nonocoins à un joueur.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "joueur", type: CustomCommandParamType.String },
        { name: "montant", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, joueur: string, montant: number) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.name === joueur);
        if (!p) {
          world.getAllPlayers()
            .find((x) => x.id === origin.sourceEntity?.id)
            ?.sendMessage(`§cJoueur "${joueur}" introuvable.`);
          return;
        }
        addBalance(p, montant);
        p.sendMessage(`§a+${fmtNC(montant)} ajoutés à votre solde.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:setmoney",
      description: "Définit le solde d'un joueur.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "joueur", type: CustomCommandParamType.String },
        { name: "montant", type: CustomCommandParamType.Integer },
      ],
    },
    (_origin, joueur: string, montant: number) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.name === joueur);
        if (!p) return;
        setBalance(p, montant);
        p.sendMessage(`§aVotre solde est maintenant de §e${fmtNC(montant)}§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:takemoney",
      description: "Retire des Nonocoins d'un joueur.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "joueur", type: CustomCommandParamType.String },
        { name: "montant", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, joueur: string, montant: number) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        const p = world.getAllPlayers().find((x) => x.name === joueur);
        if (!p) { admin?.sendMessage(`§cJoueur "${joueur}" introuvable.`); return; }
        if (!removeBalance(p, montant)) { admin?.sendMessage(`§cSolde insuffisant pour ${joueur}.`); return; }
        p.sendMessage(`§c-${fmtNC(montant)} retirés de votre solde.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
