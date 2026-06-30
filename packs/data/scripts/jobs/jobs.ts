import { world, system, Player, EntityComponentTypes, type EntityInventoryComponent } from "@minecraft/server";
import { addBalance, fmtNC } from "~/common/economy.ts";
import { getLives } from "~/life/helpers.ts";
import { JOB_META, type JobKey } from "./constants.ts";
import {
  getJobData, grantReward, getDefaultReward, getCustomJobReward,
  hasCasserReward, FISH_ITEMS, SMELT_ITEMS,
  getSalaryAmount, getSalaryMinutes, syncAllScoreboards,
} from "./helpers.ts";
import "./commands.ts";

// ── Anti-exploit : blocs posés par un joueur ──────────────────────────────────

const placedByPlayer = new Set<string>();

function isTrackable(typeId: string): boolean {
  return typeId.includes("_ore") ||
    typeId === "minecraft:ancient_debris" ||
    typeId.includes("_log") ||
    typeId === "minecraft:bamboo_block" ||
    typeId === "minecraft:reeds" ||
    typeId === "minecraft:bamboo";
}

world.afterEvents.playerPlaceBlock.subscribe((ev) => {
  const tid = ev.block.typeId;
  if (isTrackable(tid) || hasCasserReward(tid))
    placedByPlayer.add(`${ev.block.x},${ev.block.y},${ev.block.z}`);
});

// ── Piston : marquer les blocs déplacés ──────────────────────────────────────

world.afterEvents.pistonActivate.subscribe((ev) => {
  const facing = (ev.block.permutation.getState("facing_direction" as never) as unknown as number) ?? 0;
  const dirs: [number, number, number][] = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
  const [dx, dy, dz] = dirs[facing] ?? [0, 0, 0];
  for (const block of ev.piston.getAttachedBlocks()) {
    placedByPlayer.add(`${block.x},${block.y},${block.z}`);
    placedByPlayer.add(`${block.x + dx},${block.y + dy},${block.z + dz}`);
    placedByPlayer.add(`${block.x - dx},${block.y - dy},${block.z - dz}`);
  }
});

// ── Chasseur ─────────────────────────────────────────────────────────────────

world.afterEvents.entityDie.subscribe((ev) => {
  const { deadEntity, damageSource } = ev;
  if (deadEntity.typeId === "minecraft:player") return;
  const attacker = damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== "minecraft:player") return;
  const customR = getCustomJobReward("hunter", deadEntity.typeId);
  const reward = (customR?.category === "tuer" ? customR : null) ?? getDefaultReward("hunter", "tuer", deadEntity.typeId);
  if (!reward) return;
  const player = attacker as unknown as Player;
  system.run(() => grantReward(player, "hunter", reward, deadEntity.typeId));
});

// ── Bucheron ──────────────────────────────────────────────────────────────────

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const tid = ev.brokenBlockPermutation?.type?.id ?? "";
  const customR = getCustomJobReward("lumberjack", tid);
  const r = (customR?.category === "casser" ? customR : null) ?? getDefaultReward("lumberjack", "casser", tid);
  if (!r) return;
  const key = `${ev.block.x},${ev.block.y},${ev.block.z}`;
  if (placedByPlayer.has(key)) { placedByPlayer.delete(key); return; }
  system.run(() => grantReward(ev.player, "lumberjack", r, tid));
});

// ── Mineur ────────────────────────────────────────────────────────────────────

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const tid = ev.brokenBlockPermutation?.type?.id ?? "";
  const customR = getCustomJobReward("miner", tid);
  const reward = (customR?.category === "casser" ? customR : null) ?? getDefaultReward("miner", "casser", tid);
  if (!reward) return;
  const key = `${ev.block.x},${ev.block.y},${ev.block.z}`;
  if (placedByPlayer.has(key)) { placedByPlayer.delete(key); return; }
  system.run(() => grantReward(ev.player, "miner", reward, tid));
});

// ── Fermier ───────────────────────────────────────────────────────────────────

world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const tid = ev.brokenBlockPermutation?.type?.id ?? "";
  const customR = getCustomJobReward("farmer", tid);
  const reward = (customR?.category === "casser" ? customR : null)
    ?? getDefaultReward("farmer", "casser", tid, ev.brokenBlockPermutation);
  if (!reward) return;
  const key = `${ev.block.x},${ev.block.y},${ev.block.z}`;
  if (placedByPlayer.has(key)) { placedByPlayer.delete(key); return; }
  system.run(() => grantReward(ev.player, "farmer", reward, tid));
});

// ── Pêcheur : fenêtre de pêche ────────────────────────────────────────────────

const fishingPlayers = new Map<string, number>();
const fishDebits     = new Map<string, Map<string, number>>();

world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack?.typeId === "minecraft:fishing_rod")
    fishingPlayers.set(ev.source.id, system.currentTick + 400);
});

world.afterEvents.playerInventoryItemChange.subscribe((ev) => {
  const { player, beforeItemStack, itemStack } = ev;
  const bType = beforeItemStack?.typeId ?? "";
  const aType = itemStack?.typeId ?? "";
  const bAmt  = beforeItemStack?.amount ?? 0;
  const aAmt  = itemStack?.amount ?? 0;

  if (bAmt > 0 && FISH_ITEMS.has(bType)) {
    const lost = bType === aType ? Math.max(0, bAmt - aAmt) : bAmt;
    if (lost > 0) {
      const d = fishDebits.get(player.id) ?? new Map<string, number>();
      d.set(bType, (d.get(bType) ?? 0) + lost);
      fishDebits.set(player.id, d);
    }
  }

  if (aAmt > 0 && FISH_ITEMS.has(aType)) {
    const gained = aType === bType ? Math.max(0, aAmt - bAmt) : aAmt;
    if (gained <= 0) return;
    if ((fishingPlayers.get(player.id) ?? 0) < system.currentTick) return;

    const d = fishDebits.get(player.id) ?? new Map<string, number>();
    const debit = d.get(aType) ?? 0;
    const effective = Math.max(0, gained - debit);
    const newDebit = Math.max(0, debit - gained);
    if (newDebit === 0) d.delete(aType); else d.set(aType, newDebit);

    if (effective > 0) {
      const customR = getCustomJobReward("fisher", aType);
      const reward = (customR?.category === "pecher" ? customR : null) ?? { xp: 20, nc: 5 };
      grantReward(player, "fisher", reward, aType);
      fishingPlayers.delete(player.id);
    }
  }
});

// ── Four : XP de cuisson liée à la session d'ouverture du four lui-même ───────
// L'ancienne détection (changement d'inventaire + fenêtre de temps, avec ou
// sans check de proximité) accordait l'XP dès qu'un item du bon type
// apparaissait dans l'inventaire, peu importe sa provenance (un lingot pris
// dans un coffre proche comptait comme une sortie de four). On utilise ici les
// events dédiés blockContainerOpened/Closed : on photographie l'inventaire du
// joueur à l'ouverture de CE four précis, puis on compare à la fermeture. Seuls
// les items réellement récupérés pendant cette session sont récompensés —
// aucune dépendance à la lecture du contenu du four (pas toujours exposée par
// l'API) ni à un minuteur qui peut expirer trop tôt.

const FURNACE_TYPES = new Set([
  "minecraft:furnace", "minecraft:lit_furnace",
  "minecraft:blast_furnace", "minecraft:lit_blast_furnace",
  "minecraft:smoker", "minecraft:lit_smoker",
]);

function snapshotInventory(player: Player): Map<string, number> {
  const counts = new Map<string, number>();
  const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | undefined;
  const container = inv?.container;
  if (!container) return counts;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (!item) continue;
    counts.set(item.typeId, (counts.get(item.typeId) ?? 0) + item.amount);
  }
  return counts;
}

const furnaceOpenSnapshots = new Map<string, Map<string, number>>();

world.afterEvents.blockContainerOpened.subscribe((ev) => {
  if (!FURNACE_TYPES.has(ev.block.typeId)) return;
  const player = ev.openSource.entity;
  if (!(player instanceof Player)) return;
  furnaceOpenSnapshots.set(player.id, snapshotInventory(player));
});

world.afterEvents.blockContainerClosed.subscribe((ev) => {
  if (!FURNACE_TYPES.has(ev.block.typeId)) return;
  const player = ev.closeSource.entity;
  if (!(player instanceof Player)) return;
  const before = furnaceOpenSnapshots.get(player.id);
  furnaceOpenSnapshots.delete(player.id);
  if (!before) return;

  system.run(() => {
    const after = snapshotInventory(player);
    for (const [typeId, afterCount] of after) {
      const gained = afterCount - (before.get(typeId) ?? 0);
      if (gained <= 0) continue;

      const smeltCustom = getCustomJobReward("miner", typeId);
      const smeltReward = (smeltCustom?.category === "cuire" ? smeltCustom : null)
        ?? (SMELT_ITEMS.has(typeId) ? getDefaultReward("miner", "cuire", typeId) : null);
      if (smeltReward) grantReward(player, "miner", smeltReward, typeId, gained);

      const fishCuireCustom = getCustomJobReward("fisher", typeId);
      if (fishCuireCustom?.category === "cuire") grantReward(player, "fisher", fishCuireCustom, typeId, gained);
    }
  });
});

world.afterEvents.playerLeave.subscribe((ev) => {
  furnaceOpenSnapshots.delete(ev.playerId);
});

// ── Salaire périodique ────────────────────────────────────────────────────────

let lastSalaryTick = system.currentTick;

system.runInterval(() => {
  const intervalTicks = getSalaryMinutes() * 1200;
  if (system.currentTick - lastSalaryTick < intervalTicks) return;
  lastSalaryTick = system.currentTick;

  for (const player of world.getAllPlayers()) {
    if (getLives(player) <= 0) continue;
    const data = getJobData(player);
    if (data.active.length === 0) continue;
    let total = 0;
    const lines: string[] = [];
    for (const job of data.active) {
      const e = getJobData(player).jobs[job];
      const lvl = e?.lvl ?? 0;
      const amount = getSalaryAmount(job as JobKey, lvl);
      total += amount;
      lines.push(`${JOB_META[job as JobKey].color}${JOB_META[job as JobKey].label} §7Niv ${lvl} §8→ §e+${fmtNC(amount)}`);
    }
    if (total > 0) {
      addBalance(player, total);
      player.sendMessage(`§6[Salaire] §ePaiement de §f${fmtNC(total)}§e !\n${lines.join("\n")}`);
    }
  }
}, 100);

// ── Sync scoreboard à la connexion ────────────────────────────────────────────

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  system.run(() => syncAllScoreboards(ev.player));
});
