import { world, Player } from "@minecraft/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OwnedChunk { cx: number; cz: number; w?: number; h?: number; }

export interface ClaimGroup {
  id: string; owner: string; name: string;
  chunks: OwnedChunk[]; members: string[]; banned: string[];
  tpPoint?: { x: number; y: number; z: number; dim: string };
  unlockedEffects?: Array<{ id: string; level: number }>;
  effects?: Array<{ id: string; level: number }>;
  maxMembers?: number;
}

export interface HistoryEntry { n: string; t: number; }
export interface EffectDef { id: string; level: number; label: string; nc: number; needsBeacon: boolean; }

// ── Constantes ────────────────────────────────────────────────────────────────

export const CLAIM_TOOL        = "shuuaddons:claim_tool";
export const ADMIN_CLAIM_TOOL  = "shuuaddons:admin_claim_tool";
export const CLAIMS_PROPERTY   = "shuuaddons:claims";
export const MAX_ANCHORS_PROPERTY     = "shuuaddons:maxAnchors";
export const PENDING_ANCHORS_PROPERTY = "shuuaddons:pendingAnchors";
export const HISTORY_PROPERTY  = "shuuaddons:history";
export const DEFAULT_MAX_ANCHORS = 1;
export const DEFAULT_MAX_MEMBERS = 1;
export const CLAIM_SLOT_COUNT   = 5;
export const TP_SET_COST  = 5_000;
export const TP_USE_COST  = 100;

export const ANCHOR_COSTS = [0, 0, 40_000, 120_000, 400_000, 1_000_000];

export const MEMBER_CAPACITY_UPGRADES = [
  { slots: 1, nc:       0 },
  { slots: 2, nc:   5_000 },
  { slots: 3, nc:  20_000 },
  { slots: 4, nc:  50_000 },
  { slots: 5, nc: 100_000 },
];

export const CLAIM_EFFECTS: EffectDef[] = [
  { id: "speed",        level: 1, label: "Vitesse I",        nc: 100_000, needsBeacon: true  },
  { id: "speed",        level: 2, label: "Vitesse II",       nc: 250_000, needsBeacon: false },
  { id: "haste",        level: 1, label: "Hâte I",           nc: 100_000, needsBeacon: true  },
  { id: "haste",        level: 2, label: "Hâte II",          nc: 250_000, needsBeacon: false },
  { id: "strength",     level: 1, label: "Force I",          nc: 150_000, needsBeacon: true  },
  { id: "strength",     level: 2, label: "Force II",         nc: 350_000, needsBeacon: false },
  { id: "resistance",   level: 1, label: "Résistance I",     nc: 150_000, needsBeacon: true  },
  { id: "resistance",   level: 2, label: "Résistance II",    nc: 400_000, needsBeacon: false },
  { id: "regeneration", level: 1, label: "Régénération I",   nc: 200_000, needsBeacon: true  },
  { id: "regeneration", level: 2, label: "Régénération II",  nc: 500_000, needsBeacon: false },
  { id: "jump_boost",   level: 1, label: "Saut I",           nc: 100_000, needsBeacon: true  },
];

export const EFFECT_TYPES = ["speed","haste","strength","resistance","regeneration","jump_boost"];

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_THRESHOLD = Math.floor(32767 * 0.75);
const STORAGE_MAX       = Math.floor(32767 * 0.85);

function amalgamateGroups(groups: ClaimGroup[]): ClaimGroup[] {
  return groups.map((group) => {
    const rows = new Map<number, number[]>();
    for (const e of group.chunks) {
      const w = e.w ?? 1; const h = e.h ?? 1;
      for (let dz = 0; dz < h; dz++) {
        const cz = e.cz + dz;
        if (!rows.has(cz)) rows.set(cz, []);
        for (let dx = 0; dx < w; dx++) rows.get(cz)!.push(e.cx + dx);
      }
    }
    const rowSpans = new Map<number, Array<{ cx: number; w: number }>>();
    for (const [cz, cxList] of rows) {
      cxList.sort((a, b) => a - b);
      const spans: Array<{ cx: number; w: number }> = [];
      let start = cxList[0], end = cxList[0];
      for (let i = 1; i < cxList.length; i++) {
        if (cxList[i] === end + 1) { end = cxList[i]; }
        else { spans.push({ cx: start, w: end - start + 1 }); start = end = cxList[i]; }
      }
      spans.push({ cx: start, w: end - start + 1 });
      rowSpans.set(cz, spans);
    }
    type Rect = { cx: number; w: number; czStart: number; czEnd: number };
    const result: OwnedChunk[] = [];
    let active: Rect[] = [];
    for (const cz of Array.from(rows.keys()).sort((a, b) => a - b)) {
      const spans = rowSpans.get(cz)!;
      const next: Rect[] = [];
      for (const span of spans) {
        const idx = active.findIndex((r) => r.cx === span.cx && r.w === span.w && r.czEnd === cz - 1);
        if (idx !== -1) { active[idx].czEnd = cz; next.push(active.splice(idx, 1)[0]); }
        else { next.push({ cx: span.cx, w: span.w, czStart: cz, czEnd: cz }); }
      }
      for (const r of active) {
        const entry: OwnedChunk = { cx: r.cx, cz: r.czStart };
        if (r.w > 1) entry.w = r.w;
        const h = r.czEnd - r.czStart + 1;
        if (h > 1) entry.h = h;
        result.push(entry);
      }
      active = next;
    }
    for (const r of active) {
      const entry: OwnedChunk = { cx: r.cx, cz: r.czStart };
      if (r.w > 1) entry.w = r.w;
      const h = r.czEnd - r.czStart + 1;
      if (h > 1) entry.h = h;
      result.push(entry);
    }
    return { ...group, chunks: result };
  });
}

export function getClaimGroups(): ClaimGroup[] {
  const raw = world.getDynamicProperty(CLAIMS_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as ClaimGroup[]) : [];
}

export function setClaimGroups(groups: ClaimGroup[]): boolean {
  let json = JSON.stringify(groups);
  if (json.length > STORAGE_THRESHOLD) {
    const opt = amalgamateGroups(groups);
    const optJson = JSON.stringify(opt);
    if (optJson.length < json.length) json = optJson;
  }
  if (json.length > STORAGE_MAX) return false;
  world.setDynamicProperty(CLAIMS_PROPERTY, json);
  return true;
}

export function getMaxAnchors(player: Player): number {
  const val = player.getDynamicProperty(MAX_ANCHORS_PROPERTY);
  return typeof val === "number" ? val : DEFAULT_MAX_ANCHORS;
}

export function getHistory(): Record<string, HistoryEntry[]> {
  const raw = world.getDynamicProperty(HISTORY_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as Record<string, HistoryEntry[]>) : {};
}

export function addHistoryEntry(groupId: string, playerName: string): void {
  const h = getHistory();
  if (!h[groupId]) h[groupId] = [];
  h[groupId].unshift({ n: playerName, t: Date.now() });
  if (h[groupId].length > 30) h[groupId].length = 30;
  world.setDynamicProperty(HISTORY_PROPERTY, JSON.stringify(h));
}

export function clearGroupHistory(groupId: string): void {
  const h = getHistory();
  delete h[groupId];
  world.setDynamicProperty(HISTORY_PROPERTY, JSON.stringify(h));
}

export function getPendingAnchors(): Record<string, number> {
  const raw = world.getDynamicProperty(PENDING_ANCHORS_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as Record<string, number>) : {};
}

export function addPendingAnchors(playerName: string, amount: number): void {
  const pending = getPendingAnchors();
  pending[playerName] = (pending[playerName] ?? 0) + amount;
  world.setDynamicProperty(PENDING_ANCHORS_PROPERTY, JSON.stringify(pending));
}

export function consumePendingAnchors(playerName: string): number {
  const pending = getPendingAnchors();
  const amount = pending[playerName];
  if (amount === undefined) return 0;
  delete pending[playerName];
  world.setDynamicProperty(PENDING_ANCHORS_PROPERTY, JSON.stringify(pending));
  return amount;
}

// ── Chunk helpers ─────────────────────────────────────────────────────────────

export function getChunk(x: number, z: number): { cx: number; cz: number } {
  return { cx: Math.floor(x / 16), cz: Math.floor(z / 16) };
}

export function entryContainsChunk(e: OwnedChunk, cx: number, cz: number): boolean {
  const w = e.w ?? 1; const h = e.h ?? 1;
  return cx >= e.cx && cx < e.cx + w && cz >= e.cz && cz < e.cz + h;
}

export function entryIsAdjacentToChunk(e: OwnedChunk, cx: number, cz: number): boolean {
  const w = e.w ?? 1; const h = e.h ?? 1;
  const x2 = e.cx + w - 1; const z2 = e.cz + h - 1;
  if ((cx === e.cx - 1 || cx === x2 + 1) && cz >= e.cz && cz <= z2) return true;
  if ((cz === e.cz - 1 || cz === z2 + 1) && cx >= e.cx && cx <= x2) return true;
  return false;
}

export function countGroupChunks(group: ClaimGroup): number {
  return group.chunks.reduce((s, e) => s + (e.w ?? 1) * (e.h ?? 1), 0);
}

export function splitEntryExcluding(e: OwnedChunk, px: number, pz: number): OwnedChunk[] {
  const w = e.w ?? 1; const h = e.h ?? 1;
  const x2 = e.cx + w - 1; const z2 = e.cz + h - 1;
  const result: OwnedChunk[] = [];
  if (pz < z2) result.push({ cx: e.cx, cz: pz + 1, w, h: z2 - pz });
  if (pz > e.cz) result.push({ cx: e.cx, cz: e.cz, w, h: pz - e.cz });
  if (px > e.cx) result.push({ cx: e.cx, cz: pz, w: px - e.cx, h: 1 });
  if (px < x2)   result.push({ cx: px + 1, cz: pz, w: x2 - px, h: 1 });
  return result;
}

export function isGroupConnected(group: ClaimGroup): boolean {
  if (group.chunks.length === 0) return true;
  const set = new Set<string>();
  for (const e of group.chunks) {
    const w = e.w ?? 1; const h = e.h ?? 1;
    for (let dx = 0; dx < w; dx++)
      for (let dz = 0; dz < h; dz++)
        set.add(`${e.cx + dx},${e.cz + dz}`);
  }
  if (set.size <= 1) return true;
  const start = set.values().next().value!;
  const visited = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const key = queue.shift()!;
    const comma = key.indexOf(",");
    const cx = +key.slice(0, comma); const cz = +key.slice(comma + 1);
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]) {
      const nk = `${cx+dx},${cz+dz}`;
      if (set.has(nk) && !visited.has(nk)) { visited.add(nk); queue.push(nk); }
    }
  }
  return visited.size === set.size;
}

export function findGroupForChunk(cx: number, cz: number, groups: ClaimGroup[]): ClaimGroup | undefined {
  return groups.find(g => g.chunks.some(e => entryContainsChunk(e, cx, cz)));
}

export function isAdjacentToGroup(cx: number, cz: number, group: ClaimGroup): boolean {
  return group.chunks.some(e => entryIsAdjacentToChunk(e, cx, cz));
}

export function isAllowed(playerName: string, group: ClaimGroup): boolean {
  return group.owner === playerName || group.members.includes(playerName);
}

export function isBanned(playerName: string, group: ClaimGroup): boolean {
  return group.banned.includes(playerName);
}

export function validateClaimName(name: string): string | null {
  if (name.length < 2 || name.length > 20) return "Le nom doit faire entre 2 et 20 caractères.";
  if (/\s/.test(name)) return "Le nom ne peut pas contenir d'espaces (utilisez - ou _).";
  if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return "Caractères autorisés : lettres, chiffres, - et _.";
  return null;
}

export function chunkCost(currentChunkCount: number): number {
  return Math.floor(150 * Math.pow(currentChunkCount + 1, 1.3));
}

export function getNextMemberUpgrade(group: ClaimGroup): { slots: number; nc: number } | null {
  const cur = group.maxMembers ?? DEFAULT_MAX_MEMBERS;
  return MEMBER_CAPACITY_UPGRADES.find(u => u.slots > cur) ?? null;
}

export function getUnlocked(group: ClaimGroup): Array<{ id: string; level: number }> {
  return group.unlockedEffects ?? group.effects ?? [];
}

export function formatTs(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
