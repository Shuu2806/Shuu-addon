import {
  world, system, Player,
  EntityComponentTypes, type EntityInventoryComponent, type EntityHealthComponent,
  BlockPermutation, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus,
} from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getBalance, removeBalance, fmtNC } from "~/common/economy.ts";
import { showConfirmForm } from "~/common/confirm.ts";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface OwnedChunk { cx: number; cz: number; w?: number; h?: number; }

interface ClaimGroup {
  id: string; owner: string; name: string;
  chunks: OwnedChunk[]; members: string[]; banned: string[];
  tpPoint?: { x: number; y: number; z: number; dim: string };
  unlockedEffects?: Array<{ id: string; level: number }>;
  effects?: Array<{ id: string; level: number }>;
  maxMembers?: number;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_MAX_MEMBERS = 1;
const TP_SET_COST  = 5_000;
const TP_USE_COST  = 100;

const MEMBER_CAPACITY_UPGRADES = [
  { slots: 1, nc:       0 },
  { slots: 2, nc:   5_000 },
  { slots: 3, nc:  20_000 },
  { slots: 4, nc:  75_000 },
  { slots: 5, nc: 200_000 },
];

interface EffectDef { id: string; level: number; label: string; nc: number; needsBeacon: boolean; }
const CLAIM_EFFECTS: EffectDef[] = [
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

const CLAIM_TOOL       = "shuuaddons:claim_tool";
const ADMIN_CLAIM_TOOL = "shuuaddons:admin_claim_tool";
const CLAIMS_PROPERTY  = "shuuaddons:claims";
const MAX_ANCHORS_PROPERTY     = "shuuaddons:maxAnchors";
const PENDING_ANCHORS_PROPERTY = "shuuaddons:pendingAnchors";
const DEFAULT_MAX_ANCHORS      = 1;
const ANCHOR_COSTS = [0, 0, 25_000, 125_000, 500_000, 1_250_000];

// Marqueurs UI (contiennent §1 pour bloquer le fallback vanilla)
const SA_CLAIMS_MAIN    = "§r§8§1§a";
const SA_CLAIMS_LIST    = "§r§8§1§b";
const SA_CLAIMS_EDITOR  = "§r§8§1§c";
const SA_CLAIMS_TP      = "§r§8§1§d";
const SA_CLAIMS_MEMBERS = "§r§8§1§e";
const SA_CLAIMS_FX      = "§r§8§1§f";
const SA_CLAIMS_FXSHOP  = "§r§8§1§g";
const SA_CLAIMS_HOME    = "§r§8§1§h";
const SA_CLAIMS_BANS    = "§r§8§1§i";
const SA_ADMIN          = "§r§8§1§j";
const CLAIM_HIDDEN      = "§0§0§0";
const CLAIM_SLOT_COUNT  = 5;

const PROTECTED_BLOCKS = new Set([
  "minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:ender_chest",
  "minecraft:white_shulker_box","minecraft:orange_shulker_box","minecraft:magenta_shulker_box",
  "minecraft:light_blue_shulker_box","minecraft:yellow_shulker_box","minecraft:lime_shulker_box",
  "minecraft:pink_shulker_box","minecraft:gray_shulker_box","minecraft:light_gray_shulker_box",
  "minecraft:cyan_shulker_box","minecraft:purple_shulker_box","minecraft:blue_shulker_box",
  "minecraft:brown_shulker_box","minecraft:green_shulker_box","minecraft:red_shulker_box",
  "minecraft:black_shulker_box","minecraft:shulker_box",
  "minecraft:furnace","minecraft:blast_furnace","minecraft:smoker","minecraft:brewing_stand",
  "minecraft:enchanting_table","minecraft:anvil","minecraft:chipped_anvil","minecraft:damaged_anvil",
  "minecraft:frame","minecraft:glow_frame",
]);

const RESTRICTED_ITEMS = new Set([
  "minecraft:flint_and_steel","minecraft:fire_charge","minecraft:water_bucket","minecraft:lava_bucket",
  "minecraft:powder_snow_bucket","minecraft:axolotl_bucket","minecraft:cod_bucket","minecraft:salmon_bucket",
  "minecraft:tropical_fish_bucket","minecraft:pufferfish_bucket","minecraft:tadpole_bucket",
  "minecraft:bone_meal","minecraft:end_crystal",
]);

const HISTORY_PROPERTY = "shuuaddons:history";
const EFFECT_TYPES = ["speed","haste","strength","resistance","regeneration","jump_boost"];
const BORDER_RENDER_DIST = 1;

// ── Storage ───────────────────────────────────────────────────────────────────

function getClaimGroups(): ClaimGroup[] {
  const raw = world.getDynamicProperty(CLAIMS_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as ClaimGroup[]) : [];
}

interface HistoryEntry { n: string; t: number; }

function getHistory(): Record<string, HistoryEntry[]> {
  const raw = world.getDynamicProperty(HISTORY_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as Record<string, HistoryEntry[]>) : {};
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function addHistoryEntry(groupId: string, playerName: string): void {
  const h = getHistory();
  if (!h[groupId]) h[groupId] = [];
  h[groupId].unshift({ n: playerName, t: Date.now() });
  if (h[groupId].length > 30) h[groupId].length = 30;
  world.setDynamicProperty(HISTORY_PROPERTY, JSON.stringify(h));
}

function clearGroupHistory(groupId: string): void {
  const h = getHistory();
  delete h[groupId];
  world.setDynamicProperty(HISTORY_PROPERTY, JSON.stringify(h));
}

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

function setClaimGroups(groups: ClaimGroup[]): boolean {
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

function getMaxAnchors(player: Player): number {
  const val = player.getDynamicProperty(MAX_ANCHORS_PROPERTY);
  return typeof val === "number" ? val : DEFAULT_MAX_ANCHORS;
}

function getPendingAnchors(): Record<string, number> {
  const raw = world.getDynamicProperty(PENDING_ANCHORS_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as Record<string, number>) : {};
}

function addPendingAnchors(playerName: string, amount: number): void {
  const pending = getPendingAnchors();
  pending[playerName] = (pending[playerName] ?? 0) + amount;
  world.setDynamicProperty(PENDING_ANCHORS_PROPERTY, JSON.stringify(pending));
}

function consumePendingAnchors(playerName: string): number {
  const pending = getPendingAnchors();
  const amount = pending[playerName];
  if (amount === undefined) return 0;
  delete pending[playerName];
  world.setDynamicProperty(PENDING_ANCHORS_PROPERTY, JSON.stringify(pending));
  return amount;
}

// ── Chunk helpers ─────────────────────────────────────────────────────────────

function getChunk(x: number, z: number): OwnedChunk { return { cx: Math.floor(x / 16), cz: Math.floor(z / 16) }; }

function entryContainsChunk(e: OwnedChunk, cx: number, cz: number): boolean {
  const w = e.w ?? 1; const h = e.h ?? 1;
  return cx >= e.cx && cx < e.cx + w && cz >= e.cz && cz < e.cz + h;
}

function entryIsAdjacentToChunk(e: OwnedChunk, cx: number, cz: number): boolean {
  const w = e.w ?? 1; const h = e.h ?? 1;
  const x2 = e.cx + w - 1; const z2 = e.cz + h - 1;
  if ((cx === e.cx - 1 || cx === x2 + 1) && cz >= e.cz && cz <= z2) return true;
  if ((cz === e.cz - 1 || cz === z2 + 1) && cx >= e.cx && cx <= x2) return true;
  return false;
}

function countGroupChunks(group: ClaimGroup): number {
  return group.chunks.reduce((s, e) => s + (e.w ?? 1) * (e.h ?? 1), 0);
}

function splitEntryExcluding(e: OwnedChunk, px: number, pz: number): OwnedChunk[] {
  const w = e.w ?? 1; const h = e.h ?? 1;
  const x2 = e.cx + w - 1; const z2 = e.cz + h - 1;
  const result: OwnedChunk[] = [];
  if (pz < z2) result.push({ cx: e.cx, cz: pz + 1, w, h: z2 - pz });
  if (pz > e.cz) result.push({ cx: e.cx, cz: e.cz, w, h: pz - e.cz });
  if (px > e.cx) result.push({ cx: e.cx, cz: pz, w: px - e.cx, h: 1 });
  if (px < x2)   result.push({ cx: px + 1, cz: pz, w: x2 - px, h: 1 });
  return result;
}

function isGroupConnected(group: ClaimGroup): boolean {
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

function findGroupForChunk(cx: number, cz: number, groups: ClaimGroup[]): ClaimGroup | undefined {
  return groups.find((g) => g.chunks.some((e) => entryContainsChunk(e, cx, cz)));
}

function isAdjacentToGroup(cx: number, cz: number, group: ClaimGroup): boolean {
  return group.chunks.some((e) => entryIsAdjacentToChunk(e, cx, cz));
}

function isAllowed(playerName: string, group: ClaimGroup): boolean {
  return group.owner === playerName || group.members.includes(playerName);
}

function isBanned(playerName: string, group: ClaimGroup): boolean {
  return group.banned.includes(playerName);
}

function validateClaimName(name: string): string | null {
  if (name.length < 2 || name.length > 20) return "Le nom doit faire entre 2 et 20 caractères.";
  if (/\s/.test(name)) return "Le nom ne peut pas contenir d'espaces (utilisez - ou _).";
  if (!/^[a-zA-Z0-9_\-]+$/.test(name)) return "Caractères autorisés : lettres, chiffres, - et _.";
  return null;
}

function chunkCost(currentChunkCount: number): number {
  return Math.floor(150 * Math.pow(currentChunkCount + 1, 1.6));
}

function getInventory(player: Player): EntityInventoryComponent {
  return player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
}

// ── Visualisation ─────────────────────────────────────────────────────────────

function drawGroupOuterBorders(
  group: ClaimGroup, y: number, particle: string,
  dim: ReturnType<typeof world.getDimension>, step: number,
  playerCx: number, playerCz: number,
): void {
  const set = new Set<string>();
  for (const e of group.chunks) {
    const w = e.w ?? 1; const h = e.h ?? 1;
    const x1 = Math.max(e.cx, playerCx - BORDER_RENDER_DIST - 1);
    const x2 = Math.min(e.cx + w - 1, playerCx + BORDER_RENDER_DIST + 1);
    const z1 = Math.max(e.cz, playerCz - BORDER_RENDER_DIST - 1);
    const z2 = Math.min(e.cz + h - 1, playerCz + BORDER_RENDER_DIST + 1);
    for (let cx = x1; cx <= x2; cx++)
      for (let cz = z1; cz <= z2; cz++)
        set.add(`${cx},${cz}`);
  }
  for (const key of set) {
    const comma = key.indexOf(",");
    const cx = +key.slice(0, comma); const cz = +key.slice(comma + 1);
    if (Math.abs(cx - playerCx) > BORDER_RENDER_DIST || Math.abs(cz - playerCz) > BORDER_RENDER_DIST) continue;
    const bx = cx * 16; const bz = cz * 16;
    if (!set.has(`${cx},${cz - 1}`)) for (let i = 0; i <= 16; i += step) dim.spawnParticle(particle, { x: bx + i, y, z: bz });
    if (!set.has(`${cx},${cz + 1}`)) for (let i = 0; i <= 16; i += step) dim.spawnParticle(particle, { x: bx + i, y, z: bz + 16 });
    if (!set.has(`${cx - 1},${cz}`)) for (let i = 0; i <= 16; i += step) dim.spawnParticle(particle, { x: bx, y, z: bz + i });
    if (!set.has(`${cx + 1},${cz}`)) for (let i = 0; i <= 16; i += step) dim.spawnParticle(particle, { x: bx + 16, y, z: bz + i });
  }
}

function singleChunkGroup(cx: number, cz: number): ClaimGroup {
  return { id: "", owner: "", name: "", chunks: [{ cx, cz }], members: [], banned: [] };
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const held = getInventory(player)?.container?.getItem(player.selectedSlotIndex);
    if (held?.typeId !== CLAIM_TOOL && held?.typeId !== ADMIN_CLAIM_TOOL) continue;
    const dim = player.dimension;
    const y = player.location.y + 0.1;
    const { cx: curCx, cz: curCz } = getChunk(player.location.x, player.location.z);
    const groups = getClaimGroups();
    drawGroupOuterBorders(singleChunkGroup(curCx, curCz), y, "minecraft:villager_happy", dim, 4, curCx, curCz);
    for (const group of groups) {
      const nearby = group.chunks.some((e) => {
        const w = e.w ?? 1; const h = e.h ?? 1;
        return e.cx + w - 1 >= curCx - BORDER_RENDER_DIST && e.cx <= curCx + BORDER_RENDER_DIST &&
               e.cz + h - 1 >= curCz - BORDER_RENDER_DIST && e.cz <= curCz + BORDER_RENDER_DIST;
      });
      if (!nearby) continue;
      if (isAllowed(player.name, group)) drawGroupOuterBorders(group, y, "minecraft:campfire_smoke_particle", dim, 2, curCx, curCz);
      else drawGroupOuterBorders(group, y, "minecraft:basic_crit_particle", dim, 4, curCx, curCz);
    }
  }
}, 20);

// ── Cache & ban kick ──────────────────────────────────────────────────────────

let cachedGroups: ClaimGroup[] = [];
const cachedPlayerInfo = new Map<string, { name: string; isAdmin: boolean }>();
const playerGroupCache = new Map<string, string | null>();
const banKickCooldown  = new Map<string, number>();

system.runInterval(() => {
  cachedGroups = getClaimGroups();
  for (const p of world.getAllPlayers())
    cachedPlayerInfo.set(p.id, { name: p.name, isAdmin: p.hasTag("admin") });

  const groups = cachedGroups;
  if (groups.length === 0) return;
  const tick = system.currentTick;
  for (const player of world.getAllPlayers()) {
    if (player.hasTag("admin")) continue;
    const { cx, cz } = getChunk(player.location.x, player.location.z);
    const group = findGroupForChunk(cx, cz, groups);
    if (!group || !isBanned(player.name, group)) continue;
    const last = banKickCooldown.get(player.id) ?? -200;
    if (tick - last < 100) continue;
    banKickCooldown.set(player.id, tick);
    const spawn = player.getSpawnPoint();
    if (spawn) player.teleport(spawn, { dimension: spawn.dimension });
    else player.teleport({ x: 0, y: 64, z: 0 }, { dimension: world.getDimension("overworld") });
    player.sendMessage(`§cVous êtes banni du claim "${group.name}". Vous avez été expulsé.`);
  }
}, 10);

// ── Claim / Unclaim ───────────────────────────────────────────────────────────

function claimCurrentChunk(player: Player): void {
  const { cx, cz } = getChunk(player.location.x, player.location.z);
  const groups = getClaimGroups();
  const existing = findGroupForChunk(cx, cz, groups);
  if (existing) {
    if (isAllowed(player.name, existing)) player.sendMessage(`§7Ce chunk appartient déjà à ton claim "§f${existing.name}§7".`);
    else player.sendMessage(`§cCe chunk est déjà claimé par §e${existing.owner}§c.`);
    return;
  }

  const adjacentGroup = groups.find((g) => g.owner === player.name && isAdjacentToGroup(cx, cz, g));
  const cost = chunkCost(adjacentGroup ? countGroupChunks(adjacentGroup) : 0);

  if (getBalance(player) < cost) { player.sendMessage(`§cSolde insuffisant. Ce chunk coûte §e${fmtNC(cost)}§c.`); return; }

  if (adjacentGroup) {
    adjacentGroup.chunks.push({ cx, cz });
    if (!setClaimGroups(groups)) { player.sendMessage("§cImpossible de claimer : stockage plein."); return; }
    removeBalance(player, cost);
    player.sendMessage(`§aChunk ajouté au claim "§e${adjacentGroup.name}§a" ! (§e-${fmtNC(cost)}§a)`);
    return;
  }

  const playerGroups = groups.filter((g) => g.owner === player.name);
  const maxAnchors = getMaxAnchors(player);
  if (playerGroups.length >= maxAnchors) {
    player.sendMessage(`§cNombre max d'ancres atteint (${playerGroups.length}/${maxAnchors}).`);
    return;
  }

  new ModalFormData()
    .title("Nouveau claim")
    .textField("Nom du claim (lettres, chiffres, - et _) :", "Mon-Terrain")
    .show(player)
    .then((response) => {
      if (response.canceled || !response.formValues) return;
      const name = ((response.formValues[0] as string) ?? "").trim();
      const nameErr = validateClaimName(name);
      if (nameErr) { player.sendMessage(`§c${nameErr}`); return; }
      system.run(() => {
        const gs = getClaimGroups();
        if (findGroupForChunk(cx, cz, gs)) { player.sendMessage("§cCe chunk vient d'être claimé !"); return; }
        if (gs.some(g => g.owner === player.name && g.name.toLowerCase() === name.toLowerCase())) {
          player.sendMessage(`§cVous avez déjà un claim nommé "§e${name}§c".`); return;
        }
        const curCost = chunkCost(0);
        if (getBalance(player) < curCost) { player.sendMessage(`§cSolde insuffisant (§e${fmtNC(curCost)}§c requis).`); return; }
        const id = `${Date.now()}_${cx}_${cz}`;
        gs.push({ id, owner: player.name, name, chunks: [{ cx, cz }], members: [], banned: [] });
        if (!setClaimGroups(gs)) { player.sendMessage("§cImpossible de claimer : stockage plein."); return; }
        removeBalance(player, curCost);
        player.sendMessage(`§aNouvel espace claimé : "§e${name}§a" ! (§e-${fmtNC(curCost)}§a)`);
      });
    });
}

async function unclaimCurrentChunk(player: Player): Promise<void> {
  const { cx, cz } = getChunk(player.location.x, player.location.z);
  const groups = getClaimGroups();
  const group = findGroupForChunk(cx, cz, groups);
  if (!group) { player.sendMessage("§7Ce chunk n'est pas claimé."); return; }
  if (group.owner !== player.name) { player.sendMessage("§cVous n'êtes pas propriétaire de ce chunk."); return; }

  const confirmed = await showConfirmForm(player, `Libérer ce chunk du claim "§e${group.name}§r" ?`, "Unclaimer");
  if (!confirmed) return;

  system.run(() => {
        const gs = getClaimGroups();
        const g = gs.find((x) => x.id === group.id);
        if (!g) return;
        const idx = g.chunks.findIndex((e) => entryContainsChunk(e, cx, cz));
        if (idx === -1) { player.sendMessage("§cDéjà libéré."); return; }
        const newEntries = splitEntryExcluding(g.chunks[idx], cx, cz);
        const testChunks = [...g.chunks.slice(0, idx), ...newEntries, ...g.chunks.slice(idx + 1)];
        if (testChunks.length > 0 && !isGroupConnected({ ...g, chunks: testChunks })) {
          player.sendMessage("§cImpossible : ce chunk connecte d'autres parties du claim."); return;
        }
        g.chunks = testChunks;
        if (countGroupChunks(g) === 0) {
          gs.splice(gs.findIndex((x) => x.id === group.id), 1);
          setClaimGroups(gs);
          player.sendMessage(`§aClaim "§e${group.name}§a" supprimé (plus aucun chunk).`);
        } else {
          setClaimGroups(gs);
          player.sendMessage(`§aChunk libéré du claim "§e${group.name}§a".`);
        }
      });
}

// ── Protection ────────────────────────────────────────────────────────────────

world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const { player, block } = event;
  const held = getInventory(player)?.container?.getItem(player.selectedSlotIndex);
  if (held?.typeId === CLAIM_TOOL) { event.cancel = true; system.run(() => claimCurrentChunk(player)); return; }
  if (player.hasTag("admin")) return;
  const { cx, cz } = getChunk(block.x, block.z);
  const group = findGroupForChunk(cx, cz, getClaimGroups());
  if (!group) return;
  if (isBanned(player.name, group)) { event.cancel = true; system.run(() => player.sendMessage(`§cVous êtes banni du claim "§e${group.name}§c".`)); return; }
  if (!isAllowed(player.name, group)) { event.cancel = true; system.run(() => player.sendMessage(`§cCette zone appartient à §e${group.owner}§c.`)); }
});

world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { player, block } = event;
  if (player.hasTag("admin")) return;
  const { cx, cz } = getChunk(block.x, block.z);
  const group = findGroupForChunk(cx, cz, getClaimGroups());
  if (!group) return;
  if (isBanned(player.name, group) || !isAllowed(player.name, group)) {
    system.run(() => { block.setPermutation(BlockPermutation.resolve("minecraft:air")); player.sendMessage(`§cCette zone appartient à §e${group.owner}§c.`); });
  }
});

world.beforeEvents.explosion.subscribe((event) => {
  const groups = getClaimGroups();
  if (groups.length === 0) return;
  event.setImpactedBlocks(event.getImpactedBlocks().filter((b) => !findGroupForChunk(Math.floor(b.x / 16), Math.floor(b.z / 16), groups)));
});

function isBlockInteractionProtected(typeId: string): boolean {
  if (PROTECTED_BLOCKS.has(typeId)) return true;
  return typeId.endsWith("_button") || typeId.endsWith("_door") || typeId.endsWith("_trapdoor") || typeId.endsWith("_fence_gate") || typeId === "minecraft:lever";
}

function isItemRestricted(typeId: string): boolean {
  if (RESTRICTED_ITEMS.has(typeId)) return true;
  return typeId.endsWith("_hoe") || typeId.endsWith("_shovel") || typeId.endsWith("_spawn_egg");
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack } = event;
  if (!isBlockInteractionProtected(block.typeId) && !isItemRestricted(itemStack?.typeId ?? "")) return;
  if (player.hasTag("admin")) return;
  if (block.typeId === "minecraft:ender_chest") return;
  if (block.typeId === "shuuaddons:shop_chest") return;
  const { cx, cz } = getChunk(block.x, block.z);
  const group = findGroupForChunk(cx, cz, getClaimGroups());
  if (!group) return;
  if (isBanned(player.name, group)) { event.cancel = true; system.run(() => player.sendMessage(`§cVous êtes banni du claim "§e${group.name}§c".`)); return; }
  if (!isAllowed(player.name, group)) { event.cancel = true; system.run(() => player.sendMessage(`§cCette zone appartient à §e${group.owner}§c.`)); }
});

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (target.typeId === "minecraft:player") return;
  if (target.typeId === "shuuaddons:shop_display") return;
  if (player.hasTag("admin")) return;
  const { cx, cz } = getChunk(target.location.x, target.location.z);
  const group = findGroupForChunk(cx, cz, cachedGroups);
  if (!group) return;
  if (isBanned(player.name, group) || !isAllowed(player.name, group)) {
    event.cancel = true;
    system.run(() => player.sendMessage(`§cCette zone appartient à §e${group.owner}§c.`));
  }
});

world.beforeEvents.entityHurt.subscribe((event) => {
  const { hurtEntity, damageSource } = event;
  if (hurtEntity.typeId === "minecraft:player") return;
  const attacker = damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player") return;
  const pa = attacker as unknown as Player;
  if (pa.hasTag("admin")) return;
  const { cx, cz } = getChunk(hurtEntity.location.x, hurtEntity.location.z);
  const group = findGroupForChunk(cx, cz, cachedGroups);
  if (!group) return;
  if (isBanned(pa.name, group) || !isAllowed(pa.name, group)) event.cancel = true;
});

world.afterEvents.entityHurt.subscribe((event) => {
  const { hurtEntity, damageSource } = event;
  if (hurtEntity.typeId === "minecraft:player") return;
  const attacker = damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player") return;
  const pa = attacker as unknown as Player;
  if (pa.hasTag("admin")) return;
  const { cx, cz } = getChunk(hurtEntity.location.x, hurtEntity.location.z);
  const group = findGroupForChunk(cx, cz, cachedGroups);
  if (!group) return;
  if (isBanned(pa.name, group) || !isAllowed(pa.name, group)) {
    const h = hurtEntity.getComponent(EntityComponentTypes.Health) as EntityHealthComponent;
    if (h) h.setCurrentValue(h.effectiveMax);
    pa.sendMessage(`§cCette zone appartient à §e${group.owner}§c.`);
  }
});

// ── Effets ────────────────────────────────────────────────────────────────────

function hasBeacons(player: Player, count: number): boolean {
  const inv = getInventory(player); let found = 0;
  for (let i = 0; i < inv.container.size; i++) {
    const item = inv.container.getItem(i);
    if (item?.typeId === "minecraft:beacon") found += item.amount;
    if (found >= count) return true;
  }
  return false;
}

function removeBeacons(player: Player, count: number): void {
  const inv = getInventory(player); let remaining = count;
  for (let i = 0; i < inv.container.size && remaining > 0; i++) {
    const item = inv.container.getItem(i);
    if (!item || item.typeId !== "minecraft:beacon") continue;
    if (item.amount <= remaining) { remaining -= item.amount; inv.container.setItem(i, undefined); }
    else { item.amount -= remaining; inv.container.setItem(i, item); remaining = 0; }
  }
}

function getUnlocked(group: ClaimGroup): Array<{ id: string; level: number }> {
  return group.unlockedEffects ?? group.effects ?? [];
}

function showEffectsMenu(player: Player, group: ClaimGroup): void {
  const unlocked = getUnlocked(group);
  const active   = group.effects ?? [];
  const EFFECT_SLOT_COUNT = 6;

  const form = new ActionFormData()
    .title(`§6§lEffets — ${group.name}${SA_CLAIMS_FX}`)
    .body(unlocked.length === 0 ? "§fAucun effet débloqué." : "§fActivez ou désactivez vos effets.");

  form.button("§e§lAcheter des effets", "textures/items/potion_bottle_drinkable"); // 0
  form.button("§bRetour", "textures/ui/arrow_left");                                // 1

  if (unlocked.length === 0) {
    for (let i = 0; i < EFFECT_SLOT_COUNT; i++) form.button(CLAIM_HIDDEN, "");
  } else {
    for (const eff of unlocked) {
      const isActive = active.some(e => e.id === eff.id && e.level === eff.level);
      const def = CLAIM_EFFECTS.find(e => e.id === eff.id && e.level === eff.level)!;
      form.button(isActive ? `§a§l${def.label}` : `§c${def.label}`, "textures/items/potion_bottle_drinkable");
    }
    for (let i = unlocked.length; i < EFFECT_SLOT_COUNT; i++) form.button(CLAIM_HIDDEN, "");
  }

  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    if (r.selection === 0) { system.run(() => showEffectsShop(player, group)); return; }
    if (r.selection === 1) { system.run(() => showGroupEditor(player, group)); return; }
    const effIdx = r.selection - 2;
    if (effIdx >= unlocked.length) { system.run(() => showEffectsMenu(player, group)); return; }
    const eff = unlocked[effIdx];
    system.run(() => {
      const gs = getClaimGroups();
      const g = gs.find(x => x.id === group.id);
      if (!g) return;
      const isActive = (g.effects ?? []).some(e => e.id === eff.id && e.level === eff.level);
      if (isActive) { g.effects = (g.effects ?? []).filter(e => !(e.id === eff.id && e.level === eff.level)); }
      else {
        if (!g.effects) g.effects = [];
        g.effects = g.effects.filter(e => e.id !== eff.id);
        g.effects.push({ id: eff.id, level: eff.level });
      }
      setClaimGroups(gs);
      showEffectsMenu(player, g);
    });
  });
}

function showEffectsShop(player: Player, group: ClaimGroup): void {
  const unlocked = getUnlocked(group);
  const bal = getBalance(player);

  const form = new ActionFormData()
    .title(`§6§lBoutique Effets — ${group.name}${SA_CLAIMS_FXSHOP}`)
    .body(`§e${fmtNC(bal)}`);

  form.button("§bRetour", "textures/ui/arrow_left"); // 0
  for (const type of EFFECT_TYPES) {
    const curLevel = unlocked.find(e => e.id === type)?.level ?? 0;
    if (curLevel >= 2) { form.button(CLAIM_HIDDEN, ""); continue; }
    const targetLevel = curLevel + 1;
    const eff = CLAIM_EFFECTS.find(e => e.id === type && e.level === targetLevel);
    if (eff) {
      const label = targetLevel > 1 ? `Upgrade: ${eff.label}` : eff.label;
      form.button(`§e§l${label}\n§f${fmtNC(eff.nc)}${eff.needsBeacon ? " + 1 balise" : ""}`, "textures/items/potion_bottle_drinkable");
    } else { form.button(CLAIM_HIDDEN, ""); }
  }

  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    if (r.selection === 0) { system.run(() => showEffectsMenu(player, group)); return; }
    const typeIdx = r.selection - 1;
    if (typeIdx < 0 || typeIdx >= EFFECT_TYPES.length) return;
    const type = EFFECT_TYPES[typeIdx];
    const curLevel = unlocked.find(e => e.id === type)?.level ?? 0;
    if (curLevel >= 2) return;
    const targetLevel = curLevel + 1;
    const eff = CLAIM_EFFECTS.find(e => e.id === type && e.level === targetLevel);
    if (!eff) return;
    system.run(() => {
      const gs = getClaimGroups();
      const g = gs.find(x => x.id === group.id);
      if (!g) return;
      if (eff.needsBeacon && !hasBeacons(player, 1)) { player.sendMessage("§cIl vous faut §f1 balise§c."); return; }
      if (!removeBalance(player, eff.nc)) { player.sendMessage(`§cSolde insuffisant (${fmtNC(eff.nc)} requis).`); return; }
      if (eff.needsBeacon) removeBeacons(player, 1);
      if (!g.unlockedEffects) g.unlockedEffects = [...(g.effects ?? [])];
      g.unlockedEffects = g.unlockedEffects.filter(e => e.id !== eff.id);
      g.unlockedEffects.push({ id: eff.id, level: eff.level });
      if (!g.effects) g.effects = [];
      g.effects = g.effects.filter(e => e.id !== eff.id);
      g.effects.push({ id: eff.id, level: eff.level });
      setClaimGroups(gs);
      player.sendMessage(`§aEffet §f${eff.label} §adébloqué et activé !`);
      showEffectsShop(player, g);
    });
  });
}

system.runInterval(() => {
  const groups = getClaimGroups();
  for (const player of world.getAllPlayers()) {
    if (player.hasTag("admin")) continue;
    const { cx, cz } = getChunk(player.location.x, player.location.z);
    const group = findGroupForChunk(cx, cz, groups);
    if (!group || !group.effects || group.effects.length === 0) continue;
    if (!isAllowed(player.name, group)) continue;
    for (const eff of group.effects) {
      try { player.addEffect(`minecraft:${eff.id}`, 220, { amplifier: eff.level - 1, showParticles: false }); } catch (_) {}
    }
  }
}, 200);

// ── TP ────────────────────────────────────────────────────────────────────────

function showTpMenu(player: Player, group: ClaimGroup): void {
  const hasTp    = !!group.tpPoint;
  const isOwner  = group.owner === player.name;
  const body = hasTp
    ? `§fTP: §e${Math.floor(group.tpPoint!.x)}, ${Math.floor(group.tpPoint!.y)}, ${Math.floor(group.tpPoint!.z)}\n§fCoût: §e${fmtNC(TP_USE_COST)} §f(5s)`
    : "§fAucun point de TP défini.";

  const form = new ActionFormData().title(`§6§lTP — ${group.name}${SA_CLAIMS_TP}`).body(body);
  form.button("§bRetour", "textures/ui/arrow_left");
  form.button(isOwner ? `§a§lDéfinir ici\n§e${fmtNC(TP_SET_COST)}` : CLAIM_HIDDEN, isOwner ? "textures/ui/confirm" : "");
  form.button(hasTp ? `§e§lSe TP\n§f${fmtNC(TP_USE_COST)}` : CLAIM_HIDDEN, hasTp ? "textures/ui/worldsIcon" : "");
  form.button((isOwner && hasTp) ? "§cSupprimer TP" : CLAIM_HIDDEN, (isOwner && hasTp) ? "textures/ui/cancel" : "");

  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined) return;
    system.run(() => {
      const gs = getClaimGroups();
      const g = gs.find((x) => x.id === group.id);
      if (r.selection === 0 || !g) { if (g) showGroupEditor(player, g); return; }
      if (r.selection === 1 && isOwner) {
        const { cx: pcx, cz: pcz } = getChunk(player.location.x, player.location.z);
        if (!g.chunks.some(e => entryContainsChunk(e, pcx, pcz))) { player.sendMessage("§cVous devez être dans votre claim."); return; }
        if (!removeBalance(player, TP_SET_COST)) { player.sendMessage("§cSolde insuffisant."); return; }
        g.tpPoint = { x: player.location.x, y: player.location.y, z: player.location.z, dim: player.dimension.id };
        setClaimGroups(gs);
        player.sendMessage(`§aPoint de TP défini pour "§e${g.name}§a".`);
      } else if (r.selection === 2 && hasTp) {
        executeTpToClaim(player, g);
      } else if (r.selection === 3 && isOwner && hasTp) {
        delete g.tpPoint; setClaimGroups(gs);
        player.sendMessage("§aPoint de TP supprimé.");
      }
    });
  });
}

function executeTpToClaim(player: Player, group: ClaimGroup): void {
  if (!group.tpPoint) { player.sendMessage(`§cLe claim "§e${group.name}§c" n'a pas de point de TP.`); return; }
  player.sendMessage(`§6TP vers "§e${group.name}§6" dans §e5 secondes§6...`);
  const tpData = { ...group.tpPoint };
  const claimName = group.name;
  const startPos = { x: player.location.x, y: player.location.y, z: player.location.z };
  const pid = player.id;
  let cancelled = false;

  const checkId = system.runInterval(() => {
    const p = world.getAllPlayers().find(x => x.id === pid);
    if (!p) { cancelled = true; system.clearRun(checkId); return; }
    const d = Math.abs(p.location.x - startPos.x) + Math.abs(p.location.z - startPos.z);
    if (d > 0.5) { cancelled = true; system.clearRun(checkId); p.sendMessage("§cTP annulé — vous avez bougé."); }
  }, 5);

  system.runTimeout(() => {
    system.clearRun(checkId);
    if (cancelled) return;
    const p = world.getAllPlayers().find(x => x.id === pid);
    if (!p) return;
    if (!removeBalance(p, TP_USE_COST)) { p.sendMessage("§cSolde insuffisant pour le TP."); return; }
    const dim = world.getDimension(tpData.dim.replace("minecraft:", ""));
    p.teleport({ x: tpData.x, y: tpData.y, z: tpData.z }, { dimension: dim });
    p.sendMessage(`§aTP vers "§e${claimName}§a" !`);
  }, 100);
}

// ── Menus ─────────────────────────────────────────────────────────────────────

const menuCooldown = new Set<string>();

function triggerMenu(player: Player): void {
  if (menuCooldown.has(player.id)) return;
  menuCooldown.add(player.id);
  system.run(() => { menuCooldown.delete(player.id); showMainMenu(player); });
}

world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  if (itemStack.typeId === CLAIM_TOOL) { triggerMenu(player); return; }
  if (itemStack.typeId === ADMIN_CLAIM_TOOL) {
    if (!player.hasTag("admin")) { player.sendMessage("§cAccès refusé. Tag admin requis."); return; }
    if (menuCooldown.has(player.id)) return;
    menuCooldown.add(player.id);
    system.run(() => { menuCooldown.delete(player.id); showAdminMenu(player); });
  }
});

function showMainMenu(player: Player): void {
  const groups = getClaimGroups();
  const { cx: pcx, cz: pcz } = getChunk(player.location.x, player.location.z);
  const currentGroup  = findGroupForChunk(pcx, pcz, groups);
  const nearGroup     = groups.find((g) => g.owner === player.name && isAdjacentToGroup(pcx, pcz, g));
  const cost          = chunkCost(nearGroup ? countGroupChunks(nearGroup) : 0);
  const maxAnchors    = getMaxAnchors(player);
  const playerGroups  = groups.filter((g) => g.owner === player.name);
  const bal           = getBalance(player);

  let canClaim = false; let isOwnClaim = false;
  let claimText: string; let claimTex: string;

  if (currentGroup) {
    if (currentGroup.owner === player.name) {
      claimText = `§a§l${currentGroup.name}\n§fVotre claim`; claimTex = "textures/ui/worldsIcon"; isOwnClaim = true;
    } else {
      claimText = `§cZone réclamée\n§e${currentGroup.owner}`; claimTex = "textures/ui/cancel";
    }
  } else if (!nearGroup && playerGroups.length >= maxAnchors) {
    claimText = `§cPlus d'ancre\ndisponible`; claimTex = "textures/custom_ui/cadenas_close";
  } else {
    claimText = `§a§lClaimer\n§e${fmtNC(cost)}`; claimTex = "textures/ui/worldsIcon"; canClaim = true;
  }

  new ActionFormData()
    .title(`§6§lClaim Tool${SA_CLAIMS_MAIN}`)
    .body(`§e${fmtNC(bal)}`)
    .button(claimText, claimTex)
    .button("§e§lMes Claims", "textures/ui/icon_book_writable")
    .button("§cUnclaimer", "textures/ui/cancel")
    .show(player)
    .then((response) => {
      if (response.canceled || response.selection === undefined) return;
      system.run(() => {
        if (response.selection === 0) {
          if (canClaim) claimCurrentChunk(player);
          else if (isOwnClaim) { const gs = getClaimGroups(); const g = gs.find(x => x.id === currentGroup!.id); if (g) showGroupEditor(player, g); }
        } else if (response.selection === 1) showMyGroups(player);
        else if (response.selection === 2) unclaimCurrentChunk(player);
      });
    });
}

function showMyGroups(player: Player): void {
  const allGroups    = getClaimGroups();
  const groups       = allGroups.filter((g) => g.owner === player.name);
  const maxAnchors   = getMaxAnchors(player);
  const nextAnchorCost = maxAnchors < 5 ? (ANCHOR_COSTS[maxAnchors + 1] ?? null) : null;
  const bal          = getBalance(player);

  const form = new ActionFormData().title(`§6§lMes Claims${SA_CLAIMS_LIST}`).body(`§e${fmtNC(bal)}`);

  for (let i = 0; i < CLAIM_SLOT_COUNT; i++) {
    if (i < groups.length)
      form.button(`§e§l${groups[i].name}\n§f${countGroupChunks(groups[i])} chunk(s)`, "textures/ui/worldsIcon");
    else if (i < maxAnchors)
      form.button("§a§l+ Ajouter\n§fSlot libre", "textures/custom_ui/cadenas_open");
    else if (i === maxAnchors && nextAnchorCost !== null)
      form.button(`§e§lDéverrouiller\n§f${fmtNC(nextAnchorCost)}`, "textures/custom_ui/cadenas_open");
    else
      form.button("§7Slot\n§7verrouillé", "textures/custom_ui/cadenas_close");
  }

  form.show(player).then((response) => {
    if (response.canceled || response.selection === undefined) return;
    const sel = response.selection;
    if (sel < groups.length)
      system.run(() => showGroupEditor(player, groups[sel]));
    else if (sel === maxAnchors && nextAnchorCost !== null)
      system.run(() => showBuyAnchor(player, maxAnchors + 1, nextAnchorCost));
    else
      system.run(() => showMyGroups(player));
  });
}

async function showBuyAnchor(player: Player, newMax: number, cost: number): Promise<void> {
  const bal = getBalance(player);
  const msg =
    `§7Ancres après achat : §f${newMax}\n` +
    `§7Coût : §e${fmtNC(cost)}\n` +
    `§7Votre solde : §e${fmtNC(bal)}\n\n` +
    (bal >= cost ? "§aVous pouvez acheter cette ancre." : "§cSolde insuffisant.");

  const confirmed = await showConfirmForm(player, msg, "Acheter une ancre");
  if (!confirmed) { system.run(() => showMyGroups(player)); return; }

  system.run(() => {
    if (!removeBalance(player, cost)) { player.sendMessage("§cSolde insuffisant."); return; }
    const current = getMaxAnchors(player);
    player.setDynamicProperty(MAX_ANCHORS_PROPERTY, current + 1);
    player.sendMessage(`§aAncre achetée ! Vous pouvez avoir §e${current + 1} §aclaim(s).`);
    showMyGroups(player);
  });
}

function getNextMemberUpgrade(group: ClaimGroup): { slots: number; nc: number } | null {
  const cur = group.maxMembers ?? DEFAULT_MAX_MEMBERS;
  return MEMBER_CAPACITY_UPGRADES.find(u => u.slots > cur) ?? null;
}

function showGroupEditor(player: Player, group: ClaimGroup): void {
  const maxMem    = group.maxMembers ?? DEFAULT_MAX_MEMBERS;
  const tpLabel   = group.tpPoint ? "§e§lTP (modifier)" : "§b§lDéfinir TP";
  const effCount  = (group.effects ?? []).length;
  const body = [`§fChunks : §e${countGroupChunks(group)}`, `§fMembres : §e${group.members.length}§f/§e${maxMem}`, `§fEffets actifs : §e${effCount}`].join("  ");

  new ActionFormData()
    .title(`§6§l${group.name}${SA_CLAIMS_EDITOR}`)
    .body(body)
    .button(`§e§lMembres\n§f${group.members.length}/${maxMem}`, "textures/ui/permissions_member_star")
    .button(`§b§lEffets\n§f${effCount} actif(s)`, "textures/items/potion_bottle_drinkable")
    .button(tpLabel, "textures/ui/worldsIcon")
    .button("§fRenommer", "textures/ui/editIcon")
    .button("§fBans", "textures/ui/permissions_visitor_hand")
    .button("§cUnclaim", "textures/ui/cancel")
    .button("§c§lSupprimer", "textures/ui/trash_default")
    .show(player)
    .then((response) => {
      if (response.canceled || response.selection === undefined) return;
      const sel = response.selection;
      system.run(async () => {
        const gs = getClaimGroups();
        const current = gs.find((g) => g.id === group.id);
        if (!current) { player.sendMessage("§cCe claim n'existe plus."); return; }
        switch (sel) {
          case 0: manageMembers(player, current); break;
          case 1: showEffectsMenu(player, current); break;
          case 2: showTpMenu(player, current); break;
          case 3: renameGroup(player, current); break;
          case 4: manageBans(player, current); break;
          case 5: await unclaimCurrentChunk(player); break;
          case 6: await confirmDelete(player, current); break;
        }
      });
    });
}

function renameGroup(player: Player, group: ClaimGroup): void {
  new ModalFormData()
    .title("Renommer le claim")
    .textField("Nouveau nom (sans espaces) :", group.name)
    .show(player)
    .then((response) => {
      if (response.canceled || !response.formValues) return;
      const name = ((response.formValues[0] as string) ?? "").trim();
      const nameErr = validateClaimName(name);
      if (nameErr) { player.sendMessage(`§c${nameErr}`); return; }
      system.run(() => {
        const gs = getClaimGroups();
        const g = gs.find((x) => x.id === group.id);
        if (!g) return;
        if (gs.some(x => x.owner === player.name && x.id !== g.id && x.name.toLowerCase() === name.toLowerCase())) {
          player.sendMessage(`§cVous avez déjà un claim nommé "§e${name}§c".`); return;
        }
        g.name = name; setClaimGroups(gs);
        player.sendMessage(`§aClaim renommé en "§e${name}§a".`);
      });
    });
}

function manageMembers(player: Player, group: ClaimGroup): void {
  const maxMem  = group.maxMembers ?? DEFAULT_MAX_MEMBERS;
  const nextUpg = getNextMemberUpgrade(group);
  const membersLine = group.members.length > 0 ? group.members.join(", ") : "Aucun membre.";
  const body = `§fMembres : §e${group.members.length}§f/§e${maxMem}\n§f${membersLine}`;

  const form = new ActionFormData()
    .title(`§6§lMembres — ${group.name}${SA_CLAIMS_MEMBERS}`)
    .body(body)
    .button("§aAjouter", "textures/ui/confirm")
    .button("§cRetirer",  "textures/ui/cancel");

  if (nextUpg) form.button(`§e§lUpgrade §e${maxMem}→${nextUpg.slots}\n§f${fmtNC(nextUpg.nc)}`, "textures/ui/permissions_op_crown");
  else form.button("§a§lCapacité MAX (5/5)", "textures/ui/permissions_op_crown");

  form.show(player).then((response) => {
    if (response.canceled || response.selection === undefined) return;
    const sel = response.selection;
    system.run(() => {
      const gs = getClaimGroups();
      const g = gs.find((x) => x.id === group.id);
      if (!g) return;
      if (sel === 0) addMember(player, g);
      else if (sel === 1) removeMember(player, g);
      else {
        const upg = getNextMemberUpgrade(g);
        if (!upg) { player.sendMessage("§aCapacité membres déjà au maximum."); return; }
        showConfirmForm(player, `§7Passer à §f${upg.slots}§7 membres ?\n§7Coût : §e${fmtNC(upg.nc)}`, "Upgrade membres")
          .then((confirmed) => {
            if (!confirmed) return;
            system.run(() => {
              const gs2 = getClaimGroups();
              const gUpg = gs2.find(x => x.id === group.id);
              if (!gUpg) return;
              if (!removeBalance(player, upg.nc)) { player.sendMessage(`§cSolde insuffisant (${fmtNC(upg.nc)} requis).`); return; }
              gUpg.maxMembers = upg.slots; setClaimGroups(gs2);
              player.sendMessage(`§aCapacité mise à jour : §e${upg.slots} membres§a !`);
            });
          });
      }
    });
  });
}

function addMember(player: Player, group: ClaimGroup): void {
  new ModalFormData().title("Ajouter un membre").textField("Nom du joueur :", "").show(player)
    .then((response) => {
      if (response.canceled || !response.formValues) return;
      const name = ((response.formValues[0] as string) ?? "").trim();
      if (!name) return;
      system.run(() => {
        const gs = getClaimGroups();
        const g = gs.find((x) => x.id === group.id);
        if (!g) return;
        const maxMem = g.maxMembers ?? DEFAULT_MAX_MEMBERS;
        if (maxMem !== -1 && g.members.length >= maxMem) { player.sendMessage(`§cLimite de membres atteinte (${g.members.length}/${maxMem}).`); return; }
        if (g.members.includes(name)) { player.sendMessage(`§e${name}§7 est déjà membre.`); return; }
        g.members.push(name); setClaimGroups(gs);
        player.sendMessage(`§a${name} ajouté comme membre de "§e${g.name}§a".`);
      });
    });
}

function removeMember(player: Player, group: ClaimGroup): void {
  if (group.members.length === 0) { player.sendMessage("§7Aucun membre à retirer."); return; }
  new ModalFormData().title("Retirer un membre").dropdown("Membre à retirer", group.members).show(player)
    .then((response) => {
      if (response.canceled || !response.formValues) return;
      const idx = response.formValues[0] as number;
      system.run(() => {
        const gs = getClaimGroups();
        const g = gs.find((x) => x.id === group.id);
        if (!g || idx >= g.members.length) return;
        const removed = g.members.splice(idx, 1)[0];
        setClaimGroups(gs);
        player.sendMessage(`§a${removed} retiré des membres de "§e${g.name}§a".`);
      });
    });
}

function manageBans(player: Player, group: ClaimGroup): void {
  const body = group.banned.length > 0 ? group.banned.join(", ") : "Aucun joueur banni.";
  new ActionFormData()
    .title(`§6§lBans — ${group.name}${SA_CLAIMS_BANS}`)
    .body(body)
    .button("§c§lBannir", "textures/ui/cancel")
    .button("§aDébannir", "textures/ui/confirm")
    .button("§bRetour", "textures/ui/arrow_left")
    .show(player)
    .then((response) => {
      if (response.canceled || response.selection === undefined) return;
      const sel = response.selection;
      system.run(() => {
        const gs = getClaimGroups();
        const g = gs.find((x) => x.id === group.id);
        if (!g) return;
        if (sel === 0) banPlayer(player, g);
        else if (sel === 1) unbanPlayer(player, g);
        else showGroupEditor(player, g);
      });
    });
}

function banPlayer(player: Player, group: ClaimGroup): void {
  new ModalFormData().title("Bannir un joueur").textField("Nom du joueur :", "").show(player)
    .then((response) => {
      if (response.canceled || !response.formValues) return;
      const name = ((response.formValues[0] as string) ?? "").trim();
      if (!name) return;
      system.run(() => {
        const gs = getClaimGroups();
        const g = gs.find((x) => x.id === group.id);
        if (!g) return;
        if (g.banned.includes(name)) { player.sendMessage(`§e${name}§7 est déjà banni.`); return; }
        g.banned.push(name); g.members = g.members.filter((m) => m !== name);
        setClaimGroups(gs);
        player.sendMessage(`§a${name} banni du claim "§e${g.name}§a".`);
      });
    });
}

function unbanPlayer(player: Player, group: ClaimGroup): void {
  if (group.banned.length === 0) { player.sendMessage("§7Aucun joueur banni."); return; }
  new ModalFormData().title("Débannir un joueur").dropdown("Joueur à débannir", group.banned).show(player)
    .then((response) => {
      if (response.canceled || !response.formValues) return;
      const idx = response.formValues[0] as number;
      system.run(() => {
        const gs = getClaimGroups();
        const g = gs.find((x) => x.id === group.id);
        if (!g || idx >= g.banned.length) return;
        const unbanned = g.banned.splice(idx, 1)[0];
        setClaimGroups(gs);
        player.sendMessage(`§a${unbanned} débanni du claim "§e${g.name}§a".`);
      });
    });
}

async function confirmDelete(player: Player, group: ClaimGroup): Promise<void> {
  const confirmed = await showConfirmForm(
    player,
    `Abandonner "§e${group.name}§r" et ses §c${group.chunks.length}§r chunk(s) ?\n§cCette action est irréversible.`,
    "Abandonner le claim"
  );
  if (!confirmed) return;
  system.run(() => {
    const gs = getClaimGroups();
    const idx = gs.findIndex((g) => g.id === group.id);
    if (idx === -1) return;
    gs.splice(idx, 1); setClaimGroups(gs);
    player.sendMessage(`§aClaim "§e${group.name}§a" abandonné.`);
  });
}

// ── Entrée/sortie ─────────────────────────────────────────────────────────────

system.runInterval(() => {
  const groups = getClaimGroups();
  for (const player of world.getAllPlayers()) {
    const { cx, cz } = getChunk(player.location.x, player.location.z);
    const curGroup = findGroupForChunk(cx, cz, groups);
    const curId = curGroup?.id ?? null;
    if (!playerGroupCache.has(player.id)) { playerGroupCache.set(player.id, curId); continue; }
    const prevId = playerGroupCache.get(player.id) ?? null;
    if (prevId === curId) continue;
    playerGroupCache.set(player.id, curId);
    if (prevId !== null) {
      const old = groups.find((g) => g.id === prevId);
      if (old) { player.onScreenDisplay.setActionBar(`§aQuitter §b${old.name}`); player.playSound("random.orb", { pitch: 0.5, volume: 0.5 }); }
    }
    if (curId !== null && curGroup) {
      player.onScreenDisplay.setActionBar(`§aEntrer dans §b${curGroup.name} §7(§e${curGroup.owner}§7)`);
      player.playSound("random.orb", { pitch: 1.0, volume: 0.5 });
      if (!player.hasTag("admin") && !isAllowed(player.name, curGroup)) addHistoryEntry(curId, player.name);
    }
  }
}, 20);

world.afterEvents.playerLeave.subscribe((event) => { playerGroupCache.delete(event.playerId); cachedPlayerInfo.delete(event.playerId); });

// ── Admin ─────────────────────────────────────────────────────────────────────

function showAdminMenu(player: Player): void {
  const { cx, cz } = getChunk(player.location.x, player.location.z);
  const group = findGroupForChunk(cx, cz, getClaimGroups());
  const info = group
    ? `Chunk claimé par §e${group.owner}§r\nClaim : ${group.name} (${countGroupChunks(group)} chunk(s))`
    : "§7Ce chunk n'est pas claimé.";

  new ActionFormData()
    .title(`§6§lAdmin — Claim Tool${SA_ADMIN}`)
    .body(info)
    .button("§cForce unclaim ce chunk", "textures/ui/trash_default")
    .button("§eHistorique des intrus", "textures/ui/icon_book_writable")
    .show(player)
    .then((response) => {
      if (response.canceled || response.selection === undefined) return;
      system.run(async () => {
        if (response.selection === 0) await forceUnclaimChunk(player);
        else await showIntruderHistory(player, group);
      });
    });
}

async function showIntruderHistory(player: Player, group: ClaimGroup | undefined): Promise<void> {
  if (!group) { player.sendMessage("§7Pas de claim à cet endroit."); return; }
  const entries = getHistory()[group.id] ?? [];
  const body = entries.length === 0
    ? "§7Aucun intrus enregistré."
    : entries.map((e, i) => `§7${i + 1}. §e${e.n} §8(${formatTs(e.t)})`).join("\n");

  const confirmed = await showConfirmForm(
    player,
    `§fDerniers non-membres entrés (${entries.length}/30) :\n\n${body}`,
    `Intrus — ${group.name}`
  );
  if (!confirmed) return;
  system.run(() => { clearGroupHistory(group.id); player.sendMessage(`§aHistorique effacé pour "§e${group.name}§a".`); });
}

async function forceUnclaimChunk(player: Player): Promise<void> {
  const { cx, cz } = getChunk(player.location.x, player.location.z);
  const groups = getClaimGroups();
  const group  = findGroupForChunk(cx, cz, groups);
  if (!group) { player.sendMessage("§7Ce chunk n'est pas claimé."); return; }

  const confirmed = await showConfirmForm(
    player,
    `Supprimer le claim "§e${group.name}§r" de §e${group.owner}§r ?\n§c${countGroupChunks(group)} chunk(s) perdus.`,
    "Force unclaim"
  );
  if (!confirmed) return;
  system.run(() => {
    const gs = getClaimGroups();
    const idx = gs.findIndex((g) => g.id === group.id);
    if (idx === -1) return;
    gs.splice(idx, 1); setClaimGroups(gs);
    player.sendMessage(`§aClaim "§e${group.name}§a" (§e${group.owner}§a) supprimé par admin.`);
  });
}

// ── /home ─────────────────────────────────────────────────────────────────────

function showHomeMenu(player: Player, groups: ClaimGroup[]): void {
  if (groups.length === 0) { player.sendMessage("§cVous n'avez aucun claim."); return; }
  const bal = getBalance(player);

  const form = new ActionFormData()
    .title(`§6§lTéléportation${SA_CLAIMS_HOME}`)
    .body(`§e${fmtNC(bal)}  §fTP: §e${fmtNC(TP_USE_COST)}`);

  form.button("§bRetour", "textures/ui/arrow_left"); // 0
  for (let i = 0; i < CLAIM_SLOT_COUNT; i++) {
    if (i < groups.length) {
      const g = groups[i];
      form.button(`§e§l${g.name}\n${g.tpPoint ? `§e${fmtNC(TP_USE_COST)}` : "§4Pas de TP"}`, g.tpPoint ? "textures/ui/worldsIcon" : "textures/ui/cancel");
    } else { form.button(CLAIM_HIDDEN, ""); }
  }

  form.show(player).then((r) => {
    if (r.canceled || r.selection === undefined || r.selection === 0) return;
    const idx = r.selection - 1;
    if (idx >= 0 && idx < groups.length) {
      if (!groups[idx].tpPoint) { player.sendMessage(`§cLe claim "§e${groups[idx].name}§c" n'a pas de point de TP.`); system.run(() => showHomeMenu(player, groups)); }
      else { system.run(() => executeTpToClaim(player, groups[idx])); }
    }
  });
}

// ── Commandes ─────────────────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((event) => {
  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:giveanchor",
      description: "Donne des ancres de claim à un joueur.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "playerName", type: CustomCommandParamType.String }],
      optionalParameters:  [{ name: "amount",     type: CustomCommandParamType.Integer }],
    },
    (_origin, playerName: string, amount?: number) => {
      const count = amount ?? 1;
      if (count <= 0) return { status: CustomCommandStatus.Failure, message: "§cLe nombre doit être supérieur à 0." };
      system.run(() => {
        const player = world.getAllPlayers().find((p) => p.name === playerName);
        if (!player) { addPendingAnchors(playerName, count); return; }
        const current = getMaxAnchors(player);
        player.setDynamicProperty(MAX_ANCHORS_PROPERTY, current + count);
        player.sendMessage(`§a+${count} ancre(s) ! Vous pouvez créer jusqu'à §e${current + count}§a groupe(s).`);
      });
      return { status: CustomCommandStatus.Success, message: `§aAncre(s) données à ${playerName}.` };
    },
  );

  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:claimzone",
      description: "Claim tous les chunks d'une zone rectangulaire.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "x1", type: CustomCommandParamType.Integer },
        { name: "z1", type: CustomCommandParamType.Integer },
        { name: "x2", type: CustomCommandParamType.Integer },
        { name: "z2", type: CustomCommandParamType.Integer },
        { name: "nom", type: CustomCommandParamType.String },
      ],
    },
    (origin, x1: number, z1: number, x2: number, z2: number, nom: string) => {
      const ownerName = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id)?.name ?? "Admin";
      system.run(() => {
        const cx1 = Math.floor(Math.min(x1, x2) / 16); const cz1 = Math.floor(Math.min(z1, z2) / 16);
        const cx2 = Math.floor(Math.max(x1, x2) / 16); const cz2 = Math.floor(Math.max(z1, z2) / 16);
        const groups = getClaimGroups();
        const runner = world.getAllPlayers().find((p) => p.name === ownerName);
        for (let cx = cx1; cx <= cx2; cx++)
          for (let cz = cz1; cz <= cz2; cz++)
            if (findGroupForChunk(cx, cz, groups)) { runner?.sendMessage("§cCertains chunks sont déjà claimés."); return; }
        const totalChunks = (cx2 - cx1 + 1) * (cz2 - cz1 + 1);
        groups.push({ id: `zone_${Date.now()}_${cx1}_${cz1}`, owner: ownerName, name: nom, chunks: [{ cx: cx1, cz: cz1, w: cx2 - cx1 + 1, h: cz2 - cz1 + 1 }], members: [], banned: [] });
        if (!setClaimGroups(groups)) { runner?.sendMessage("§cImpossible : stockage plein (85%)."); return; }
        runner?.sendMessage(`§a${totalChunks} chunk(s) claimés dans "§e${nom}§a".`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  event.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:home",
      description: "Téléportation vers un de vos claims.",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "nom", type: CustomCommandParamType.String }],
    },
    (origin, nom?: string) => {
      system.run(() => {
        const player = world.getAllPlayers().find(p => p.id === origin.sourceEntity?.id);
        if (!player) return;
        const groups = getClaimGroups().filter(g => g.owner === player.name);
        if (groups.length === 0) { player.sendMessage("§7Vous n'avez aucun claim."); return; }
        if (!nom) { showHomeMenu(player, groups); return; }
        const group = groups.find(g => g.name.toLowerCase() === nom.toLowerCase());
        if (!group) {
          const names = groups.map(g => `§e${g.name}§7`).join(", ");
          player.sendMessage(`§cClaim "§e${nom}§c" introuvable.\n§7Vos claims : ${names}`); return;
        }
        executeTpToClaim(player, group);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  if (!initialSpawn) return;
  const pending = consumePendingAnchors(player.name);
  if (pending <= 0) return;
  const current = getMaxAnchors(player);
  player.setDynamicProperty(MAX_ANCHORS_PROPERTY, current + pending);
  player.sendMessage(`§a+${pending} ancre(s) de claim reçue(s) pendant votre absence !`);
});
