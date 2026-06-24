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
    updateScoreboard(player, job, getJobEntry(data, job).lvl);
  }
}

// ── XP / level ───────────────────────────────────────────────────────────────

export function xpForLevel(n: number): number {
  return Math.floor(1000 * Math.pow(n, 1.5));
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
  return Math.floor(getBaseSalary(job) * Math.pow(1 + level / 100, 1.5));
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
  return nc * Math.pow(1 + level / 100, 2);
}

// ── Grant reward ──────────────────────────────────────────────────────────────

export function grantReward(player: Player, job: JobKey, baseReward: ActionReward, actionId = "", count = 1): void {
  const data = getJobData(player);
  if (!data.active.includes(job)) return;

  const entry = getJobEntry(data, job);
  if (entry.lvl >= MAX_LEVEL) return;

  const mult = getUpgradeMultiplier(job, entry.lvl, actionId);
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
  if (leveled) {
    updateScoreboard(player, job, entry.lvl);
    player.sendMessage(`§6[Métier] ${meta.color}${meta.label} §6passe niveau §e${entry.lvl}§6 !`);
    player.playSound("random.levelup");
    player.onScreenDisplay.setActionBar(`${meta.color}${meta.label} §6— Niveau §e${entry.lvl} §6!`);
  } else {
    const gainTxt = whole >= 1 ? ` §6+${whole} NC` : "";
    player.onScreenDisplay.setActionBar(
      `${meta.color}${meta.label} §8| §f+${reward.xp} XP${gainTxt} §8| §7Niv ${entry.lvl}`,
    );
  }

  data.jobs[job] = entry;
  setJobData(player, data);
}
