import { world, Player } from "@minecraft/server";
import { addBalance } from "~/common/economy.ts";
import {
  JOBS_KEY, MAX_LEVEL, ALL_JOBS,
  type JobKey, JOB_META,
} from "./constants.ts";
import { JOBS_CONFIG, type ConfigEntry } from "./jobs_config.ts";
import { UPGRADES_CONFIG, type UpgradeEntry } from "./upgrades_config.ts";

export interface JobEntry { lvl: number; xp: number; acc: number; }
export interface JobData  { jobs: Partial<Record<JobKey, JobEntry>>; active: JobKey[]; maxJobs: number; }

export type JobCategory = "casser" | "cuire" | "pecher" | "tuer";
export interface ActionReward { xp: number; nc: number; }
export interface CustomJobReward extends ActionReward { category: JobCategory; }
export type RewardMap = Partial<Record<JobKey, Record<string, CustomJobReward>>>;
export type UpgradeMap = Partial<Record<JobKey, UpgradeEntry[]>>;

const CUSTOM_REWARDS_KEY  = "shuuaddons:jobrewards";
const CUSTOM_UPGRADES_KEY = "shuuaddons:jobupgrades";
const CUSTOM_SALARY_KEY   = "shuuaddons:jobsalary";
const SALARY_CONFIG_KEY   = "shuuaddons:salaryconfig";
const BOOSTS_KEY          = "shuuaddons:jobboosts";
const PLAYER_BOOST_KEY    = "shuuaddons:playerboost";
const PENDING_BOOSTS_KEY  = "shuuaddons:pendingboosts";

const BASE_SALARY: Record<JobKey, number> = {
  hunter: 50, lumberjack: 50, miner: 50, fisher: 50, farmer: 50,
};

export const FISH_ITEMS  = new Set(Object.keys(JOBS_CONFIG.fisher?.pecher  ?? {}));
export const SMELT_ITEMS = new Set(Object.keys(JOBS_CONFIG.miner?.cuire   ?? {}));

// ── Job data ──────────────────────────────────────────────────────────────────

export function getJobData(player: Player): JobData {
  const raw = player.getDynamicProperty(JOBS_KEY);
  return typeof raw === "string"
    ? (JSON.parse(raw) as JobData)
    : { jobs: {}, active: [], maxJobs: 1 };
}

export function setJobData(player: Player, data: JobData): void {
  player.setDynamicProperty(JOBS_KEY, JSON.stringify(data));
}

export function getJobEntry(data: JobData, job: JobKey): JobEntry {
  return data.jobs[job] ?? { lvl: 0, xp: 0, acc: 0 };
}

// ── Scoreboard ────────────────────────────────────────────────────────────────

export function ensureObjectives(): void {
  for (const [, meta] of Object.entries(JOB_META)) {
    try {
      if (!world.scoreboard.getObjective(meta.scoreId))
        world.scoreboard.addObjective(meta.scoreId, meta.label + " Niv.");
    } catch (_) {}
  }
}

export function updateScoreboard(player: Player, job: JobKey, level: number): void {
  try {
    const obj = world.scoreboard.getObjective(JOB_META[job].scoreId);
    if (obj) obj.setScore(player, level);
  } catch (_) {}
}

export function syncAllScoreboards(player: Player): void {
  const data = getJobData(player);
  for (const job of ALL_JOBS) {
    const lvl = getJobEntry(data, job).lvl;
    updateScoreboard(player, job, lvl);
    upsertTopPlayer(player.name, job, lvl);
  }
}

// ── Top players cache (world dynamic property) ────────────────────────────────

const TOP_PLAYERS_KEY = "shuuaddons:topplayers";
type TopPlayersData = Partial<Record<JobKey, Record<string, { name: string; lvl: number }>>>;

function getTopPlayersData(): TopPlayersData {
  const raw = world.getDynamicProperty(TOP_PLAYERS_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as TopPlayersData) : {};
}

export function upsertTopPlayer(name: string, job: JobKey, lvl: number): void {
  const data = getTopPlayersData();
  if (!data[job]) data[job] = {};
  if (lvl > 0) {
    data[job]![name] = { name, lvl };
  } else {
    delete data[job]![name];
  }
  world.setDynamicProperty(TOP_PLAYERS_KEY, JSON.stringify(data));
}

export function getTop3Players(job: JobKey): { name: string; lvl: number }[] {
  const data = getTopPlayersData()[job] ?? {};
  return Object.values(data)
    .sort((a, b) => b.lvl - a.lvl)
    .slice(0, 3);
}

// ── XP / level ───────────────────────────────────────────────────────────────

export function xpForLevel(n: number): number {
  return Math.floor(1000 * Math.pow(n, 1.4));
}

// ── Custom rewards ────────────────────────────────────────────────────────────

export function getCustomRewardsMap(): RewardMap {
  const raw = world.getDynamicProperty(CUSTOM_REWARDS_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as RewardMap) : {};
}

export function setCustomRewardsMap(map: RewardMap): void {
  world.setDynamicProperty(CUSTOM_REWARDS_KEY, JSON.stringify(map));
}

export function getCustomJobReward(job: JobKey, itemId: string): CustomJobReward | null {
  return getCustomRewardsMap()[job]?.[itemId] ?? null;
}

export function hasCasserReward(typeId: string): boolean {
  const map = getCustomRewardsMap();
  if (ALL_JOBS.some((j) => map[j]?.[typeId]?.category === "casser")) return true;
  return ALL_JOBS.some((j) => {
    const cat = JOBS_CONFIG[j]?.["casser"] as Record<string, ConfigEntry> | undefined;
    const entry = cat?.[typeId];
    return entry !== undefined && entry.maxAge === undefined;
  });
}

// ── Upgrades ──────────────────────────────────────────────────────────────────

export function getCustomUpgradesMap(): UpgradeMap {
  const raw = world.getDynamicProperty(CUSTOM_UPGRADES_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as UpgradeMap) : {};
}

export function getEffectiveUpgrades(job: JobKey): UpgradeEntry[] {
  return getCustomUpgradesMap()[job] ?? (UPGRADES_CONFIG[job] ?? []);
}

export function getUpgradeMultiplier(job: JobKey, level: number, actionId: string): number {
  let m = 1;
  for (const u of getEffectiveUpgrades(job)) {
    if (u.level > level) continue;
    if (u.match.length === 0 || u.match.some((k) => actionId.includes(k))) m *= u.multiplier;
  }
  return m;
}

// ── Salary ────────────────────────────────────────────────────────────────────

export function getSalaryMinutes(): number {
  const raw = world.getDynamicProperty(SALARY_CONFIG_KEY);
  return typeof raw === "string" ? ((JSON.parse(raw) as { interval?: number }).interval ?? 20) : 20;
}

export function getBaseSalary(job: JobKey): number {
  const raw = world.getDynamicProperty(CUSTOM_SALARY_KEY);
  const custom = typeof raw === "string" ? (JSON.parse(raw) as Partial<Record<JobKey, number>>) : {};
  return custom[job] ?? BASE_SALARY[job];
}

export function getSalaryAmount(job: JobKey, level: number): number {
  return Math.floor(getBaseSalary(job) * Math.pow(1 + level / 25, 1.3));
}

// ── Default reward ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDefaultReward(job: JobKey, category: string, typeId: string, perm?: any): ActionReward | null {
  const entry = (JOBS_CONFIG[job]?.[category] as Record<string, ConfigEntry> | undefined)?.[typeId];
  if (entry) {
    if (entry.maxAge !== undefined) {
      const raw = perm?.getState(entry.stateName ?? "growth");
      const val = Number(raw);
      if (!Number.isFinite(val) || val !== entry.maxAge) return null;
    }
    return { xp: entry.xp, nc: entry.nc };
  }
  if (job === "hunter" && category === "tuer" && typeId.startsWith("minecraft:")) {
    const fallback = (JOBS_CONFIG.hunter?.tuer as Record<string, ConfigEntry> | undefined)?.["_default"];
    return fallback ? { xp: fallback.xp, nc: fallback.nc } : null;
  }
  return null;
}

export function fmtNcVal(nc: number): string {
  const t = Math.floor(nc * 100) / 100;
  return t % 1 === 0 ? `${t}` : t.toFixed(2);
}

export function scaleNC(nc: number, level: number): number {
  return nc * Math.pow(1 + level / 25, 1.3);
}

// ── Boost personnel (top contributeurs cagnotte) ───────────────────────────────

interface PlayerBoostData { multiplier: number; expiresAt: number; }
export interface PendingBoostReward { playerName: string; multiplier: number; durationMs: number; }

function getPlayerBoostData(player: Player): PlayerBoostData | null {
  const raw = player.getDynamicProperty(PLAYER_BOOST_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as PlayerBoostData) : null;
}

export function getPlayerBoost(player: Player): number {
  const data = getPlayerBoostData(player);
  if (!data) return 1;
  if (Date.now() > data.expiresAt) {
    player.setDynamicProperty(PLAYER_BOOST_KEY, undefined);
    return 1;
  }
  return data.multiplier;
}

function getPendingBoosts(): PendingBoostReward[] {
  const raw = world.getDynamicProperty(PENDING_BOOSTS_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as PendingBoostReward[]) : [];
}

function setPendingBoosts(list: PendingBoostReward[]): void {
  world.setDynamicProperty(PENDING_BOOSTS_KEY, JSON.stringify(list));
}

function applyPersonalBoost(player: Player, reward: PendingBoostReward): void {
  const expiresAt = Date.now() + reward.durationMs;
  player.setDynamicProperty(PLAYER_BOOST_KEY, JSON.stringify({ multiplier: reward.multiplier, expiresAt }));
  const hours = Math.round(reward.durationMs / (60 * 60 * 1000));
  const rank  = reward.multiplier >= 2 ? "§61er" : reward.multiplier >= 1.5 ? "§72e" : "§c3e";
  player.sendMessage(`§d[Cagnotte] §eTu es le ${rank} §econtributeur ! Boost §d×${reward.multiplier} §ependant §f${hours}h§e !`);
}

export function claimPendingBoost(player: Player): void {
  const pending = getPendingBoosts();
  const idx = pending.findIndex((p) => p.playerName === player.name);
  if (idx === -1) return;
  const [reward] = pending.splice(idx, 1);
  setPendingBoosts(pending);
  applyPersonalBoost(player, reward);
}

const TOP_MULTIPLIERS = [2, 1.5, 1.3] as const;
const BOOST_DURATION_MS = 3 * 60 * 60 * 1000;

export function addTopContributorBoosts(contributors: Record<string, number>): void {
  const sorted = Object.entries(contributors).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (sorted.length === 0) return;

  const pending = getPendingBoosts();
  const lines: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const [name] = sorted[i];
    const multiplier = TOP_MULTIPLIERS[i];
    const reward: PendingBoostReward = { playerName: name, multiplier, durationMs: BOOST_DURATION_MS };
    const rank = i === 0 ? "§61er" : i === 1 ? "§72e" : "§c3e";
    lines.push(`${rank} §f${name} §8— §d×${multiplier}`);

    const existing = pending.findIndex((p) => p.playerName === name);
    if (existing !== -1) pending[existing] = reward; else pending.push(reward);

    const online = world.getAllPlayers().find((p) => p.name === name);
    if (online) {
      const pidx = pending.findIndex((p) => p.playerName === name);
      if (pidx !== -1) {
        const [r] = pending.splice(pidx, 1);
        applyPersonalBoost(online, r);
      }
    }
  }

  setPendingBoosts(pending);
  world.sendMessage(`§6[Cagnotte] §eTop contributeurs boostés :\n${lines.join("\n")}`);
}

// ── Boosts globaux (job) ────────────────────────────────────────────────────────

export interface BoostEntry { multiplier: number; expiresAt: number | null; }
type BoostsMap = Partial<Record<JobKey, BoostEntry>>;

function getBoostsMap(): BoostsMap {
  const raw = world.getDynamicProperty(BOOSTS_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as BoostsMap) : {};
}

function setBoostsMap(map: BoostsMap): void {
  world.setDynamicProperty(BOOSTS_KEY, JSON.stringify(map));
}

export function getJobBoost(job: JobKey): number {
  const map = getBoostsMap();
  const entry = map[job];
  if (!entry) return 1;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    delete map[job];
    setBoostsMap(map);
    return 1;
  }
  return entry.multiplier;
}

// multiplier <= 0 désactive le boost (le retire). Les valeurs entre 0 et 1
// (exclu) sont acceptées comme un débuff volontaire (ex: 0.5 = moitié XP/NC).
export function setJobBoost(job: JobKey, multiplier: number, expiresAt: number | null): void {
  const map = getBoostsMap();
  if (multiplier <= 0) {
    delete map[job];
  } else {
    map[job] = { multiplier, expiresAt };
  }
  setBoostsMap(map);
}

// ── Grant reward ──────────────────────────────────────────────────────────────

export function grantReward(player: Player, job: JobKey, baseReward: ActionReward, actionId = "", count = 1): void {
  const data = getJobData(player);
  if (!data.active.includes(job)) return;

  const entry = getJobEntry(data, job);
  if (entry.lvl >= MAX_LEVEL) return;

  const upgradeMult   = getUpgradeMultiplier(job, entry.lvl, actionId);
  const globalBoost   = getJobBoost(job);
  const personalBoost = getPlayerBoost(player);
  const boostMult     = globalBoost + (personalBoost - 1);
  const mult          = upgradeMult * boostMult;
  const reward: ActionReward = {
    xp: Math.round(baseReward.xp * mult) * count,
    nc: baseReward.nc * mult * count,
  };

  entry.xp += reward.xp;

  let leveled = false;
  while (entry.lvl < MAX_LEVEL) {
    const needed = xpForLevel(entry.lvl + 1);
    if (entry.xp < needed) break;
    entry.xp -= needed;
    entry.lvl++;
    leveled = true;
  }

  entry.acc = (entry.acc ?? 0) + scaleNC(reward.nc, entry.lvl);
  const whole = Math.floor(entry.acc);
  if (whole >= 1) {
    entry.acc -= whole;
    addBalance(player, whole);
  }

  const meta = JOB_META[job];
  const boostTxt = boostMult > 1 ? ` §d[×${+boostMult.toFixed(2).replace(/\.?0+$/, "")}]` : "";
  if (leveled) {
    updateScoreboard(player, job, entry.lvl);
    upsertTopPlayer(player.name, job, entry.lvl);
    player.sendMessage(`§6[Métier] ${meta.color}${meta.label} §6passe niveau §e${entry.lvl}§6 !`);
    player.playSound("random.levelup");
    player.onScreenDisplay.setActionBar(`${meta.color}${meta.label} §6— Niveau §e${entry.lvl} §6!`);
  } else {
    const gainTxt = whole >= 1 ? ` §6+${whole} NC` : "";
    player.onScreenDisplay.setActionBar(
      `${meta.color}${meta.label}${boostTxt} §8| §f+${reward.xp} XP${gainTxt} §8| §7Niv ${entry.lvl}`,
    );
  }

  data.jobs[job] = entry;
  setJobData(player, data);
}
