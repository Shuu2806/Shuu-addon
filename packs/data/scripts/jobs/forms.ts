import { system, world, Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { showFormWithRetry } from "~/common/form-utils.ts";
import { showConfirmForm } from "~/common/confirm.ts";
import { fmtNC, getBalance, removeBalance } from "~/common/economy.ts";
import {
  ALL_JOBS, JOB_META, JOB_ICONS, MATCH_FR,
  JOB_SLOT_COUNT, JOB_SLOT_COSTS, HIDDEN_BTN,
  JOBS_MENU_TAG, JOBS_DETAIL_TAG, JOBS_GAINS_TAG, JOBS_LIST_TAG,
  type JobKey,
} from "./constants.ts";
import {
  getJobData, setJobData, getJobEntry, xpForLevel,
  getEffectiveUpgrades, getSalaryAmount, getSalaryMinutes,
  getCustomRewardsMap, updateScoreboard,
  type JobCategory,
} from "./helpers.ts";
import { JOBS_CONFIG, type ConfigEntry } from "./jobs_config.ts";

function fmtNcVal(nc: number): string {
  const t = Math.floor(nc * 100) / 100;
  return t % 1 === 0 ? `${t}` : t.toFixed(2);
}

function buildTop3Text(job: JobKey): string {
  const medals = ["§6", "§7", "§c"];
  const top = world.getAllPlayers()
    .map((p) => ({ name: p.name, lvl: getJobEntry(getJobData(p), job).lvl }))
    .filter((e) => e.lvl > 0)
    .sort((a, b) => b.lvl - a.lvl)
    .slice(0, 3);

  return [0, 1, 2]
    .map((i) => top[i]
      ? `${medals[i]}${i + 1}. §f${top[i].name} §8- §eNiv.${top[i].lvl}`
      : `${medals[i]}${i + 1}. §7Aucun joueur`)
    .join("\n\n");
}

// ── Menu principal ────────────────────────────────────────────────────────────

export async function showJobMenu(player: Player): Promise<void> {
  const data = getJobData(player);
  const bal = getBalance(player);
  const nextSlotCost = JOB_SLOT_COSTS[data.maxJobs + 1] ?? null;

  const form = new ActionFormData()
    .title(`§6§lMétiers§r${JOBS_MENU_TAG}`)
    .body(`§e${fmtNC(bal)}`);

  for (let i = 0; i < JOB_SLOT_COUNT; i++) {
    if (i < data.active.length) {
      const job = data.active[i];
      const e = getJobEntry(data, job);
      const meta = JOB_META[job];
      const xpPct = Math.min(100, Math.floor((e.xp / xpForLevel(e.lvl + 1)) * 100));
      form.button(`${meta.color}§l${meta.label}\n§fNiv. §e${e.lvl}`, `textures/custom_ui/bars/pct_${xpPct}`);
    } else if (i < data.maxJobs) {
      form.button("§fSlot libre\n §a§lAjouter un métier\n", "textures/items/diamond");
    } else if (i === data.maxJobs && nextSlotCost !== null) {
      form.button(`§e§lDéverrouiller\n§f${fmtNC(nextSlotCost)}`, "textures/custom_ui/cadenas_open");
    } else {
      form.button("§7Slot\n§7verrouillé", "textures/custom_ui/cadenas_close");
    }
  }

  form.button(HIDDEN_BTN, "");

  const response = await showFormWithRetry(form, player);
  if (response.canceled || response.selection === undefined) return;
  const idx = response.selection;

  if (idx < data.active.length) {
    system.run(async () => { await showJobDetail(player, data.active[idx]); });
  } else if (idx < data.maxJobs) {
    system.run(async () => { await showAddJob(player); });
  } else if (idx === data.maxJobs && nextSlotCost !== null) {
    system.run(async () => { await showBuySlot(player); });
  } else {
    system.run(async () => { await showJobMenu(player); });
  }
}

// ── Détail d'un métier ────────────────────────────────────────────────────────

export async function showJobDetail(player: Player, job: JobKey): Promise<void> {
  const data = getJobData(player);
  const e = getJobEntry(data, job);
  const meta = JOB_META[job];
  const salary = getSalaryAmount(job, e.lvl);
  const freq = getSalaryMinutes();
  const nextXp = xpForLevel(e.lvl + 1);
  const xpPct = Math.min(100, Math.floor((e.xp / nextXp) * 100));

  const upgradeLines = getEffectiveUpgrades(job).map((u) => {
    const col = e.lvl >= u.level ? "§a" : "§7";
    const matchTxt = u.match.length > 0
      ? ` (${u.match.map((m) => MATCH_FR[m] ?? m).join(", ")})`
      : "";
    return `${col}§lNV ${u.level} : §r${col}${u.label}\n${col}x${u.multiplier}${matchTxt}`;
  }).join("\n\n");

  const body = `§e§lUpgrades§r\n\n${upgradeLines || "§7Aucun upgrade défini."}`;
  const top3Text = buildTop3Text(job);

  const form = new ActionFormData()
    .title(`${meta.color}§l${meta.label} — Niv.${e.lvl}§r${JOBS_DETAIL_TAG}`)
    .body(body)
    .button(`§fNiveau §e${e.lvl} §8| §fXP §e${e.xp}§8/§e${nextXp}`, `textures/custom_ui/bars/pct_${xpPct}`)
    .button(`§eSalaire\n§f${fmtNC(salary)} /${freq}min`, "textures/items/diamond")
    .button("§eVoir les gains", "textures/items/book_writable")
    .button(top3Text, "")
    .button("§c§lQuitter le métier", "textures/ui/cancel")
    .button("§bRetour", "textures/ui/arrow_left");

  const response = await showFormWithRetry(form, player);
  if (response.canceled || response.selection === undefined) return;
  const sel = response.selection;
  if (sel <= 1 || sel === 3) return;

  if (sel === 2) {
    system.run(async () => { await showJobGains(player, job); });
    return;
  }
  if (sel === 4) {
    const confirmed = await showConfirmForm(
      player,
      `Retirer §e${meta.label}§r et perdre toute sa progression ?`,
      "Retirer un métier"
    );
    if (!confirmed) {
      system.run(async () => { await showJobDetail(player, job); });
      return;
    }
    system.run(() => {
      const d = getJobData(player);
      d.active = d.active.filter((j) => j !== job);
      delete d.jobs[job];
      setJobData(player, d);
      updateScoreboard(player, job, 0);
      player.sendMessage(`§aMétier §e${meta.label} §aretirée.`);
    });
    return;
  }
  if (sel === 5) {
    system.run(async () => { await showJobMenu(player); });
  }
}

// ── Gains ─────────────────────────────────────────────────────────────────────

export async function showJobGains(player: Player, job: JobKey): Promise<void> {
  const meta = JOB_META[job];
  const customs = getCustomRewardsMap()[job] ?? {};
  const jobCfg = JOBS_CONFIG[job] ?? {};
  const sections: string[] = [];

  const catLabels: Record<JobCategory, string> = {
    casser: "Casser", cuire: "Cuire", pecher: "Pêcher", tuer: "Tuer",
  };

  for (const cat of (["casser", "cuire", "pecher", "tuer"] as JobCategory[])) {
    const baseCat = (jobCfg[cat] ?? {}) as Record<string, ConfigEntry>;
    const lines: string[] = [];

    for (const [id, entry] of Object.entries(baseCat)) {
      if (id.startsWith("_")) continue;
      const override = customs[id];
      if (override?.category === cat && override.xp === 0 && override.nc === 0) continue;
      const eff = (override?.category === cat) ? override : entry;
      lines.push(`§f${entry.label} : §e${eff.xp} XP §8/ §6${fmtNcVal(eff.nc)} NC`);
    }

    for (const [id, r] of Object.entries(customs)) {
      if (r.category !== cat) continue;
      if (r.xp === 0 && r.nc === 0) continue;
      if (baseCat[id]) continue;
      lines.push(`§f${id.replace("minecraft:", "")} : §e${r.xp} XP §8/ §6${fmtNcVal(r.nc)} NC`);
    }

    if (job === "hunter" && cat === "tuer") {
      const fb = (baseCat as Record<string, { label: string; xp: number; nc: number }>)["_default"];
      if (fb) lines.push(`§7${fb.label} : §e${fb.xp} XP §8/ §6${fb.nc} NC`);
    }

    if (lines.length > 0)
      sections.push(`§e§l[${catLabels[cat]}]\n\n${lines.join("\n")}`);
  }

  const allLines = sections.join("\n\n§6──────────\n\n").split("\n");
  const half    = allLines.length > 26 ? Math.ceil(allLines.length / 2) : allLines.length;
  const leftCol = allLines.slice(0, half).join("\n") || "§fAucun gain défini.";
  const rightCol = allLines.slice(half).join("\n");

  const form = new ActionFormData()
    .title(`§6§lGains — ${meta.label}§r${JOBS_GAINS_TAG}`)
    .body(leftCol)
    .button(rightCol, "")
    .button("§bRetour", "textures/ui/arrow_left");

  const response = await showFormWithRetry(form, player);
  if (response.canceled || response.selection !== 1) return;
  system.run(async () => { await showJobDetail(player, job); });
}

// ── Ajouter un métier ─────────────────────────────────────────────────────────

export async function showAddJob(player: Player): Promise<void> {
  const data = getJobData(player);
  const available = ALL_JOBS.filter((j) => !data.active.includes(j));
  if (available.length === 0) {
    player.sendMessage("§cTous les métiers sont déjà actifs.");
    return;
  }

  const form = new ActionFormData()
    .title(`§6§lAjouter un métier§r${JOBS_LIST_TAG}`)
    .body("§fSélectionnez le métier à ajouter :");

  for (const job of available) {
    const e = getJobEntry(data, job);
    const meta = JOB_META[job];
    form.button(`${meta.color}§l${meta.label}\n§fNiv. §e${e.lvl}`, JOB_ICONS[job]);
  }

  for (let i = 0; i < JOB_SLOT_COUNT - available.length +1; i++){
    form.button(HIDDEN_BTN, "");
  }

  const response = await showFormWithRetry(form, player);
  if (response.canceled || response.selection === undefined || response.selection >= available.length) return;
  const chosen = available[response.selection];

  system.run(async () => {
    const d = getJobData(player);
    if (d.active.length >= d.maxJobs) { player.sendMessage("§cPlus de slot disponible."); return; }
    if (!d.active.includes(chosen)) d.active.push(chosen);
    setJobData(player, d);
    player.sendMessage(`§aMétier §e${JOB_META[chosen].label} §aajouté !`);
    await showJobMenu(player);
  });
}

// ── Acheter un slot ───────────────────────────────────────────────────────────

export async function showBuySlot(player: Player): Promise<void> {
  const data = getJobData(player);
  const newMax = data.maxJobs + 1;
  if (newMax > JOB_SLOT_COUNT) {
    player.sendMessage("§cVous avez déjà le maximum de slots.");
    return;
  }

  const cost = JOB_SLOT_COSTS[newMax];
  const bal = getBalance(player);
  const canAfford = bal >= cost;

  const msg =
    `§7Slots après achat : §f${newMax}\n` +
    `§7Coût : §e${fmtNC(cost)}\n` +
    `§7Votre solde : §e${fmtNC(bal)}\n\n` +
    (canAfford ? "§aVous pouvez acheter ce slot." : "§cSolde insuffisant.");

  const confirmed = await showConfirmForm(player, msg, "Acheter un slot métier");
  if (!confirmed) { system.run(async () => { await showJobMenu(player); }); return; }

  system.run(() => {
    const d = getJobData(player);
    if (!removeBalance(player, cost)) { player.sendMessage("§cSolde insuffisant."); return; }
    d.maxJobs = newMax;
    setJobData(player, d);
    player.sendMessage(`§aSlot déverrouillé ! Vous pouvez maintenant avoir §e${newMax} §amétier(s).`);
    system.run(async () => { await showJobMenu(player); });
  });
}
