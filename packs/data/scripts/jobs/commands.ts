import {
  world,
  system,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
} from "@minecraft/server";
import { fmtNC } from "~/common/economy.ts";
import {
  JOB_FR_NAMES, JOB_NAME_LIST, MAX_LEVEL,
  resolveJob, type JobKey,
} from "./constants.ts";
import {
  getJobData, setJobData, getJobEntry,
  getCustomRewardsMap, setCustomRewardsMap,
  getCustomUpgradesMap, getEffectiveUpgrades,
  updateScoreboard, ensureObjectives,
  upsertTopPlayer, getTop3Players,
  getSalaryMinutes, fmtNcVal,
  type JobCategory,
} from "./helpers.ts";
import { UPGRADES_CONFIG, type UpgradeEntry } from "./upgrades_config.ts";
import { showJobMenu } from "./forms.tsx";

const CUSTOM_UPGRADES_KEY = "shuuaddons:jobupgrades";
const CUSTOM_SALARY_KEY   = "shuuaddons:jobsalary";
const SALARY_CONFIG_KEY   = "shuuaddons:salaryconfig";

// ── /shuuaddons:jobs ──────────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ensureObjectives();
  ev.customCommandRegistry.registerEnum("shuuaddons:jobname", JOB_NAME_LIST);

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:jobs",
      description: "Ouvre le menu des métiers.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      system.run(async () => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (p) await showJobMenu(p);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:setjoblevel ───────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:setjoblevel",
      description: "Définit le niveau d'un métier pour un joueur.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "joueur",                type: CustomCommandParamType.String  },
        { name: "shuuaddons:jobname",    type: CustomCommandParamType.Enum    },
        { name: "niveau",                type: CustomCommandParamType.Integer },
      ],
    },
    (origin, joueur: string, metier: string, niveau: number) => {
      system.run(() => {
        const admin  = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const target = world.getAllPlayers().find((p) => p.name === joueur);
        if (!target) { admin?.sendMessage(`§cJoueur "${joueur}" introuvable.`); return; }
        const job = resolveJob(metier);
        if (!job) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const lvl = Math.max(0, Math.min(MAX_LEVEL, niveau));
        const d = getJobData(target);
        d.jobs[job] = { lvl, xp: 0, acc: 0 };
        if (!d.active.includes(job)) d.active.push(job);
        if (d.active.length > d.maxJobs) d.maxJobs = d.active.length;
        setJobData(target, d);
        updateScoreboard(target, job, lvl);
        upsertTopPlayer(target.name, job, lvl);
        admin?.sendMessage(`§aMétier §e${job} §ade §e${target.name} §adéfini au niveau §e${lvl}§a.`);
        target.sendMessage(`§aVotre métier §e${job} §aa été défini au niveau §e${lvl}§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:givejoblevel ──────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:givejoblevel",
      description: "Ajoute des niveaux à un métier pour un joueur (relatif).",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "joueur",             type: CustomCommandParamType.String  },
        { name: "shuuaddons:jobname", type: CustomCommandParamType.Enum    },
        { name: "niveau",             type: CustomCommandParamType.Integer },
      ],
    },
    (origin, joueur: string, metier: string, niveau: number) => {
      system.run(() => {
        const admin  = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const target = world.getAllPlayers().find((p) => p.name === joueur);
        if (!target) { admin?.sendMessage(`§cJoueur "${joueur}" introuvable.`); return; }
        const job = resolveJob(metier);
        if (!job) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const d = getJobData(target);
        const cur = getJobEntry(d, job);
        const lvl = Math.max(0, Math.min(MAX_LEVEL, cur.lvl + niveau));
        d.jobs[job] = { lvl, xp: 0, acc: 0 };
        if (!d.active.includes(job)) d.active.push(job);
        if (d.active.length > d.maxJobs) d.maxJobs = d.active.length;
        setJobData(target, d);
        updateScoreboard(target, job, lvl);
        upsertTopPlayer(target.name, job, lvl);
        admin?.sendMessage(`§aMétier §e${job} §ade §e${target.name} §a: §e${cur.lvl} → ${lvl}§a.`);
        target.sendMessage(`§aVotre métier §e${job} §aest passé au niveau §e${lvl}§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:removejoblevel ────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:removejoblevel",
      description: "Retire des niveaux à un métier pour un joueur (relatif).",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "joueur",             type: CustomCommandParamType.String  },
        { name: "shuuaddons:jobname", type: CustomCommandParamType.Enum    },
        { name: "niveau",             type: CustomCommandParamType.Integer },
      ],
    },
    (origin, joueur: string, metier: string, niveau: number) => {
      system.run(() => {
        const admin  = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const target = world.getAllPlayers().find((p) => p.name === joueur);
        if (!target) { admin?.sendMessage(`§cJoueur "${joueur}" introuvable.`); return; }
        const job = resolveJob(metier);
        if (!job) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const d = getJobData(target);
        const cur = getJobEntry(d, job);
        const lvl = Math.max(0, Math.min(MAX_LEVEL, cur.lvl - niveau));
        d.jobs[job] = { lvl, xp: 0, acc: 0 };
        if (!d.active.includes(job)) d.active.push(job);
        if (d.active.length > d.maxJobs) d.maxJobs = d.active.length;
        setJobData(target, d);
        updateScoreboard(target, job, lvl);
        upsertTopPlayer(target.name, job, lvl);
        admin?.sendMessage(`§aMétier §e${job} §ade §e${target.name} §a: §e${cur.lvl} → ${lvl}§a.`);
        target.sendMessage(`§aVotre métier §e${job} §aest passé au niveau §e${lvl}§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:topjob ────────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:topjob",
      description: "Affiche le top 3 d'un métier.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "shuuaddons:jobname", type: CustomCommandParamType.Enum },
      ],
    },
    (origin, metier: string) => {
      system.run(() => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (!p) return;
        const job = resolveJob(metier);
        if (!job) { p.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const top3 = getTop3Players(job);
        if (top3.length === 0) { p.sendMessage(`§7Aucun classement pour §f${metier}§7 pour le moment.`); return; }
        const medals = ["§61.", "§72.", "§c3."];
        const lines = top3.map((e, i) => `${medals[i]} §f${e.name} §8— §eNiv ${e.lvl}`).join("\n");
        p.sendMessage(`§6=== Top ${metier} ===\n${lines}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:addjobitem ────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:addjobitem",
      description: "Ajoute/modifie une récompense. Usage: <metier> <itemId> <categorie> <xp> <nc>",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "metier",    type: CustomCommandParamType.String },
        { name: "itemId",    type: CustomCommandParamType.String },
        { name: "categorie", type: CustomCommandParamType.String },
        { name: "xp",        type: CustomCommandParamType.Float  },
        { name: "nc",        type: CustomCommandParamType.Float  },
      ],
    },
    (origin, metier: string, itemId: string, categorie: string, xp: number, nc: number) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const validCats: JobCategory[] = ["casser", "cuire", "pecher", "tuer"];
        if (!validCats.includes(categorie as JobCategory)) {
          admin?.sendMessage(`§cCatégorie invalide. Valeurs : ${validCats.join(", ")}`);
          return;
        }
        const map = getCustomRewardsMap();
        if (!map[jobKey]) map[jobKey] = {};
        map[jobKey]![itemId] = { xp, nc, category: categorie as JobCategory };
        setCustomRewardsMap(map);
        admin?.sendMessage(`§aRécompense définie : §f${metier} §8[${categorie}] §f${itemId} §8→ §exp:${xp} nc:${fmtNcVal(nc)}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:removejobitem ─────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:removejobitem",
      description: "Retire une récompense personnalisée d'un métier.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "metier", type: CustomCommandParamType.String },
        { name: "itemId", type: CustomCommandParamType.String },
      ],
    },
    (origin, metier: string, itemId: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const map = getCustomRewardsMap();
        if (!map[jobKey]?.[itemId]) {
          admin?.sendMessage(`§cAucune récompense personnalisée pour §f${metier}/${itemId}§c.`);
          return;
        }
        delete map[jobKey]![itemId];
        setCustomRewardsMap(map);
        admin?.sendMessage(`§aRécompense §f${metier}/${itemId} §asupprimée (retour au défaut).`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:listjobitems ──────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:listjobitems",
      description: "Liste les récompenses personnalisées d'un métier.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "metier", type: CustomCommandParamType.String }],
    },
    (origin, metier: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        if (!admin) return;
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const custom = getCustomRewardsMap()[jobKey] ?? {};
        const entries = Object.entries(custom);
        if (entries.length === 0) { admin.sendMessage(`§7Aucune récompense personnalisée pour §f${metier}§7.`); return; }
        const lines = entries.map(([id, r]) => `§f${id} §8→ §exp:${r.xp} nc:${fmtNcVal(r.nc)}`).join("\n");
        admin.sendMessage(`§6=== ${metier} récompenses custom ===\n${lines}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:setjobsalary ──────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:setjobsalary",
      description: "Définit le salaire de base d'un métier.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "metier",  type: CustomCommandParamType.String  },
        { name: "salaire", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, metier: string, salaire: number) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const raw = world.getDynamicProperty(CUSTOM_SALARY_KEY);
        const custom = typeof raw === "string"
          ? JSON.parse(raw) as Partial<Record<JobKey, number>>
          : {};
        custom[jobKey] = salaire;
        world.setDynamicProperty(CUSTOM_SALARY_KEY, JSON.stringify(custom));
        admin?.sendMessage(`§aSalaire de §f${metier} §adéfini à §e${fmtNC(salaire)}/${getSalaryMinutes()}min§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:setjobfrequency ───────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:setjobfrequency",
      description: "Définit la fréquence du salaire en minutes.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "minutes", type: CustomCommandParamType.Integer }],
    },
    (origin, minutes: number) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        if (minutes < 1) { admin?.sendMessage("§cMinimum 1 minute."); return; }
        world.setDynamicProperty(SALARY_CONFIG_KEY, JSON.stringify({ interval: minutes }));
        admin?.sendMessage(`§aFréquence du salaire définie à §e${minutes} minute(s)§a.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:addjobupgrade ─────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:addjobupgrade",
      description: "Ajoute/modifie un upgrade. match=all ou mots-clés séparés par virgule.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "metier",      type: CustomCommandParamType.String  },
        { name: "niveau",      type: CustomCommandParamType.Integer },
        { name: "multiplier",  type: CustomCommandParamType.String  },
        { name: "label",       type: CustomCommandParamType.String  },
      ],
      optionalParameters: [
        { name: "match", type: CustomCommandParamType.String },
      ],
    },
    (origin, metier: string, niveau: number, multiplierStr: string, label: string, match?: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const mult = parseFloat(multiplierStr);
        if (isNaN(mult) || mult <= 0) { admin?.sendMessage("§cMultiplicateur invalide."); return; }
        const matchArr: string[] = (!match || match === "all") ? [] : match.split(",").map((s) => s.trim()).filter(Boolean);
        const map = getCustomUpgradesMap();
        const upgrades: UpgradeEntry[] = map[jobKey] ?? [...(UPGRADES_CONFIG[jobKey] ?? [])];
        const existing = upgrades.findIndex((u) => u.level === niveau);
        const entry: UpgradeEntry = { level: niveau, label, match: matchArr, multiplier: mult };
        if (existing >= 0) upgrades[existing] = entry; else upgrades.push(entry);
        upgrades.sort((a, b) => a.level - b.level);
        map[jobKey] = upgrades;
        world.setDynamicProperty(CUSTOM_UPGRADES_KEY, JSON.stringify(map));
        admin?.sendMessage(`§aUpgrade §e${metier} §8(Niv ${niveau}) §adéfini : §f${label} §8×${mult}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:removejobupgrade ─────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:removejobupgrade",
      description: "Retire un upgrade à un niveau spécifique d'un métier.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "metier", type: CustomCommandParamType.String  },
        { name: "niveau", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, metier: string, niveau: number) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const map = getCustomUpgradesMap();
        const upgrades = map[jobKey] ?? [...(UPGRADES_CONFIG[jobKey] ?? [])];
        const before = upgrades.length;
        map[jobKey] = upgrades.filter((u) => u.level !== niveau);
        if (map[jobKey]!.length === before) {
          admin?.sendMessage(`§cAucun upgrade au niveau ${niveau} pour §f${metier}§c.`);
          return;
        }
        world.setDynamicProperty(CUSTOM_UPGRADES_KEY, JSON.stringify(map));
        admin?.sendMessage(`§aUpgrade §e${metier} §8Niv ${niveau} §asupprimé.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:listjobupgrades ───────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:listjobupgrades",
      description: "Liste les upgrades d'un métier.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "metier", type: CustomCommandParamType.String }],
    },
    (origin, metier: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        if (!admin) return;
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const upgrades = getEffectiveUpgrades(jobKey);
        const isCustom = !!getCustomUpgradesMap()[jobKey];
        const lines = upgrades.map((u) =>
          `§eNiv ${u.level} §f${u.label} §8×${u.multiplier} §7[${u.match.length ? u.match.join(",") : "all"}]`
        ).join("\n");
        admin.sendMessage(`§6=== ${metier} upgrades ${isCustom ? "§a(custom)" : "§7(défaut)"} ===\n${lines}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ── /shuuaddons:resetjobupgrades ─────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:resetjobupgrades",
      description: "Remet les upgrades d'un métier aux valeurs par défaut.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "metier", type: CustomCommandParamType.String }],
    },
    (origin, metier: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const jobKey = resolveJob(metier);
        if (!jobKey) { admin?.sendMessage(`§cMétier inconnu. Valeurs : ${JOB_FR_NAMES}`); return; }
        const map = getCustomUpgradesMap();
        delete map[jobKey];
        world.setDynamicProperty(CUSTOM_UPGRADES_KEY, JSON.stringify(map));
        admin?.sendMessage(`§aUpgrades de §f${metier} §aremis aux valeurs par défaut.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
