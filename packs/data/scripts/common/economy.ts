import {
  world,
  system,
  Player,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";

const ECONOMY_KEY        = "shuuaddons:eco";
const ECONOMY_MIRROR_KEY = "shuuaddons:eco_mirror";

let mirrorCache: Record<string, number> | null = null;
let mirrorDirty = false;

function getMirror(): Record<string, number> {
  if (mirrorCache) return mirrorCache;
  const raw = world.getDynamicProperty(ECONOMY_MIRROR_KEY);
  try {
    mirrorCache = typeof raw === "string" ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch (_) {
    mirrorCache = {};
  }
  return mirrorCache;
}

function setMirrorEntry(name: string, balance: number): void {
  getMirror()[name] = balance;
  mirrorDirty = true;
}

function flushMirror(): void {
  if (!mirrorDirty || !mirrorCache) return;
  const serialized = JSON.stringify(mirrorCache);
  if (serialized.length > 27856) {
    world.sendMessage("§c[Shuu] ⚠ eco_mirror proche de la limite de stockage Bedrock !");
  }
  world.setDynamicProperty(ECONOMY_MIRROR_KEY, serialized);
  mirrorDirty = false;
}

system.runInterval(flushMirror, 200);

export function getBalance(player: Player): number {
  const v = player.getDynamicProperty(ECONOMY_KEY);
  return typeof v === "number" ? v : 0;
}

export function setBalance(player: Player, n: number): void {
  const v = Math.max(0, Math.floor(n));
  player.setDynamicProperty(ECONOMY_KEY, v);
  setMirrorEntry(player.name, v);
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

// ── Variantes par nom (incluent les joueurs hors ligne) ────────────────────────

export function getBalanceByName(name: string): number {
  const online = world.getAllPlayers().find((p) => p.name === name);
  if (online) return getBalance(online);
  return getMirror()[name] ?? 0;
}

export function setBalanceByName(name: string, n: number): number {
  const v = Math.max(0, Math.floor(n));
  const online = world.getAllPlayers().find((p) => p.name === name);
  if (online) { setBalance(online, v); return v; }
  setMirrorEntry(name, v);
  return v;
}

export function addBalanceByName(name: string, n: number): number {
  return setBalanceByName(name, getBalanceByName(name) + n);
}

export function removeBalanceByName(name: string, n: number): boolean {
  const cur = getBalanceByName(name);
  if (cur < n) return false;
  setBalanceByName(name, cur - n);
  return true;
}

world.afterEvents.playerLeave.subscribe(() => {
  flushMirror();
});

// ── Sync à la connexion (cas où le solde a été modifié hors ligne) ─────────────

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  system.run(() => {
    const mirror = getMirror();
    if (ev.player.name in mirror) {
      ev.player.setDynamicProperty(ECONOMY_KEY, mirror[ev.player.name]);
    } else {
      setMirrorEntry(ev.player.name, getBalance(ev.player));
    }
  });
});

export function getTopBalances(count: number): { name: string; balance: number }[] {
  const mirror = getMirror();
  return Object.entries(mirror)
    .map(([name, balance]) => ({ name, balance }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, count);
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
      description: "Affiche votre solde ou celui d'un autre joueur en Nonocoins.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "joueur", type: CustomCommandParamType.String }],
    },
    (origin, joueur?: string) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!p) return;
        if (!joueur) { p.sendMessage(`§6Votre solde : §e${fmtNC(getBalance(p))}`); return; }
        p.sendMessage(`§6Solde de §e${joueur} §6: §e${fmtNC(getBalanceByName(joueur))}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:topbalance",
      description: "Affiche le top 10 des soldes en Nonocoins.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!p) return;
        const top10 = getTopBalances(10);
        if (top10.length === 0) { p.sendMessage("§7Aucun solde enregistré pour le moment."); return; }
        const medals = ["§61.", "§72.", "§c3."];
        const lines = top10.map((e, i) => `${medals[i] ?? `§7${i + 1}.`} §f${e.name} §8— §e${fmtNC(e.balance)}`).join("\n");
        p.sendMessage(`§6=== Top Richesses ===\n${lines}`);
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
        if (joueur === sender.name) { sender.sendMessage("§cVous ne pouvez pas vous payer vous-même."); return; }
        const target = world.getAllPlayers().find((x) => x.name === joueur);
        if (!target) { sender.sendMessage(`§c${joueur} n'est pas connecté.`); return; }
        if (!removeBalance(sender, montant)) { sender.sendMessage("§cSolde insuffisant."); return; }
        addBalance(target, montant);
        sender.sendMessage(`§aVous avez envoyé §e${fmtNC(montant)} §aà §e${joueur}§a.`);
        target.sendMessage(`§aVous avez reçu §e${fmtNC(montant)} §ade §e${sender.name}§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:givenc",
      description: "Donne des Nonocoins à un joueur (même hors ligne).",
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
        addBalanceByName(joueur, montant);
        admin?.sendMessage(`§a+${fmtNC(montant)} ajoutés au solde de §e${joueur}§a.`);
        world.getAllPlayers().find((x) => x.name === joueur)
          ?.sendMessage(`§a+${fmtNC(montant)} ajoutés à votre solde.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:setnc",
      description: "Définit le solde d'un joueur (même hors ligne).",
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
        setBalanceByName(joueur, montant);
        admin?.sendMessage(`§aSolde de §e${joueur} §adéfini à §e${fmtNC(montant)}§a.`);
        world.getAllPlayers().find((x) => x.name === joueur)
          ?.sendMessage(`§aVotre solde est maintenant de §e${fmtNC(montant)}§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:removenc",
      description: "Retire des Nonocoins d'un joueur (même hors ligne).",
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
        if (!removeBalanceByName(joueur, montant)) { admin?.sendMessage(`§cSolde insuffisant pour ${joueur}.`); return; }
        admin?.sendMessage(`§c-${fmtNC(montant)} retirés du solde de §e${joueur}§c.`);
        world.getAllPlayers().find((x) => x.name === joueur)
          ?.sendMessage(`§c-${fmtNC(montant)} retirés de votre solde.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
