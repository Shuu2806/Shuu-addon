import {
  world, system, Player,
  EntityComponentTypes, type EntityInventoryComponent, type EntityHealthComponent,
  BlockPermutation, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus,
} from "@minecraft/server";
import type { ClaimGroup } from "./data.ts";
import {
  CLAIM_TOOL, ADMIN_CLAIM_TOOL, MAX_ANCHORS_PROPERTY,
  getClaimGroups, setClaimGroups, getMaxAnchors, addHistoryEntry,
  consumePendingAnchors, addPendingAnchors,
  getChunk, findGroupForChunk, isAllowed, isBanned,
} from "./data.ts";
import { showMainMenu, showAdminMenu, showHomeMenu, executeTpToClaim } from "./forms.tsx";

// ── Constantes locales ────────────────────────────────────────────────────────

const BORDER_RENDER_DIST = 1;

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

// ── Inventory helper ──────────────────────────────────────────────────────────

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

// ── Protection ────────────────────────────────────────────────────────────────

function isBlockInteractionProtected(typeId: string): boolean {
  if (PROTECTED_BLOCKS.has(typeId)) return true;
  return typeId.endsWith("_button") || typeId.endsWith("_door") || typeId.endsWith("_trapdoor") || typeId.endsWith("_fence_gate") || typeId === "minecraft:lever";
}

function isItemRestricted(typeId: string): boolean {
  if (RESTRICTED_ITEMS.has(typeId)) return true;
  return typeId.endsWith("_hoe") || typeId.endsWith("_shovel") || typeId.endsWith("_axe") || typeId.endsWith("_spawn_egg");
}

world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const { player, block } = event;
  const held = getInventory(player)?.container?.getItem(player.selectedSlotIndex);
  if (held?.typeId === CLAIM_TOOL) { event.cancel = true; system.run(() => showMainMenu(player)); return; }
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

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack } = event;
  if (!isBlockInteractionProtected(block.typeId) && !isItemRestricted(itemStack?.typeId ?? "")) return;
  if (player.hasTag("admin")) return;
  if (block.typeId === "minecraft:ender_chest" || block.typeId === "shuuaddons:shop_chest") return;
  const { cx, cz } = getChunk(block.x, block.z);
  const group = findGroupForChunk(cx, cz, getClaimGroups());
  if (!group) return;
  if (isBanned(player.name, group)) { event.cancel = true; system.run(() => player.sendMessage(`§cVous êtes banni du claim "§e${group.name}§c".`)); return; }
  if (!isAllowed(player.name, group)) { event.cancel = true; system.run(() => player.sendMessage(`§cCette zone appartient à §e${group.owner}§c.`)); }
});

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const { player, target } = event;
  if (target.typeId === "minecraft:player" || target.typeId === "shuuaddons:shop_display") return;
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

world.afterEvents.playerLeave.subscribe((event) => {
  playerGroupCache.delete(event.playerId);
  cachedPlayerInfo.delete(event.playerId);
});

// ── Menu trigger ──────────────────────────────────────────────────────────────

const menuCooldown = new Set<string>();

world.afterEvents.itemUse.subscribe((event) => {
  const { source: player, itemStack } = event;
  if (itemStack.typeId === CLAIM_TOOL) {
    if (menuCooldown.has(player.id)) return;
    menuCooldown.add(player.id);
    system.run(() => { menuCooldown.delete(player.id); showMainMenu(player); });
    return;
  }
  if (itemStack.typeId === ADMIN_CLAIM_TOOL) {
    if (!player.hasTag("admin")) { player.sendMessage("§cAccès refusé. Tag admin requis."); return; }
    if (menuCooldown.has(player.id)) return;
    menuCooldown.add(player.id);
    system.run(() => { menuCooldown.delete(player.id); showAdminMenu(player); });
  }
});

// ── Spawn (ancres en attente) ─────────────────────────────────────────────────

world.afterEvents.playerSpawn.subscribe((event) => {
  const { player, initialSpawn } = event;
  if (!initialSpawn) return;
  const pending = consumePendingAnchors(player.name);
  if (pending <= 0) return;
  const current = getMaxAnchors(player);
  player.setDynamicProperty(MAX_ANCHORS_PROPERTY, current + pending);
  player.sendMessage(`§a+${pending} ancre(s) de claim reçue(s) pendant votre absence !`);
});

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
        const player = world.getAllPlayers().find(p => p.name === playerName);
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
      const ownerName = world.getAllPlayers().find(p => p.id === origin.sourceEntity?.id)?.name ?? "Admin";
      system.run(() => {
        const cx1 = Math.floor(Math.min(x1, x2) / 16); const cz1 = Math.floor(Math.min(z1, z2) / 16);
        const cx2 = Math.floor(Math.max(x1, x2) / 16); const cz2 = Math.floor(Math.max(z1, z2) / 16);
        const groups = getClaimGroups();
        const runner = world.getAllPlayers().find(p => p.name === ownerName);
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
