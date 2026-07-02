import {
  world, Player, type Entity, type Container,
  EntityComponentTypes, type EntityInventoryComponent, ItemStack, BlockPermutation,
  EquipmentSlot, type EntityEquippableComponent,
} from "@minecraft/server";
import { removeBalance, addBalance, fmtNC } from "~/common/economy.ts";
import {
  SHOP_BLOCK, SHOP_BLOCK as SHOP_ITEM, P_ITEM, P_AMOUNT, P_PRICE,
  P_SELLER, P_SHOP_NAME, P_ITEM_DATA, DEFAULT_NAME,
  rewardsKey, buildNameTag, getItemName,
} from "./constants.ts";

export function getEntityInv(entity: Entity): Container | undefined {
  return (entity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent)?.container;
}

export function getPlayerInv(player: Player): Container | undefined {
  return (player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent)?.container;
}

export function countFreeSpace(player: Player, typeId: string): number {
  const inv = getPlayerInv(player);
  if (!inv) return 0;
  let space = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it) space += 64;
    else if (it.typeId === typeId && it.amount < 64) space += 64 - it.amount;
  }
  return space;
}

export function giveItemsToPlayer(player: Player, typeId: string, qty: number): number {
  const inv = getPlayerInv(player);
  if (!inv) return qty;
  let remaining = qty;
  for (let i = 0; i < inv.size && remaining > 0; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId !== typeId || it.amount >= 64) continue;
    const add = Math.min(64 - it.amount, remaining);
    inv.setItem(i, new ItemStack(typeId, it.amount + add));
    remaining -= add;
  }
  for (let i = 0; i < inv.size && remaining > 0; i++) {
    if (inv.getItem(i)) continue;
    const add = Math.min(64, remaining);
    inv.setItem(i, new ItemStack(typeId, add));
    remaining -= add;
  }
  return remaining;
}

function getArmorSlot(typeId: string): EquipmentSlot {
  const n = typeId.replace(/^[^:]+:/, "");
  if (n.includes("helmet"))     return EquipmentSlot.Head;
  if (n.includes("chestplate")) return EquipmentSlot.Chest;
  if (n.includes("leggings"))   return EquipmentSlot.Legs;
  if (n.includes("boots"))      return EquipmentSlot.Feet;
  return EquipmentSlot.Mainhand;
}

export function equipItem(entity: Entity, typeId: string): void {
  const eq = entity.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
  if (!eq) return;
  try { eq.setEquipment(getArmorSlot(typeId), new ItemStack(typeId)); } catch {}
}

export function clearEquip(entity: Entity, typeId: string): void {
  const eq = entity.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent | undefined;
  if (!eq) return;
  try { eq.setEquipment(getArmorSlot(typeId), undefined); } catch {}
}

export function isOwnerOrAdmin(player: Player, entity: Entity): boolean {
  return player.hasTag("admin") || player.name === entity.getDynamicProperty("placedBy");
}

export function isInOwnedClaim(playerName: string, x: number, z: number): boolean {
  const raw = world.getDynamicProperty("shuuaddons:claims");
  if (typeof raw !== "string") return false;
  interface RawChunk { cx: number; cz: number; w?: number; h?: number; }
  interface RawGroup { owner: string; chunks: RawChunk[]; }
  let groups: RawGroup[];
  try { groups = JSON.parse(raw) as RawGroup[]; } catch { return false; }
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  for (const g of groups) {
    if (g.owner !== playerName) continue;
    for (const chunk of g.chunks) {
      const w = chunk.w ?? 1, h = chunk.h ?? 1;
      if (cx >= chunk.cx && cx < chunk.cx + w && cz >= chunk.cz && cz < chunk.cz + h) return true;
    }
  }
  return false;
}

export function getRewards(playerName: string): number {
  const v = world.getDynamicProperty(rewardsKey(playerName));
  return typeof v === "number" ? v : 0;
}

export function addRewards(playerName: string, amount: number): void {
  world.setDynamicProperty(rewardsKey(playerName), getRewards(playerName) + amount);
}

export function clearRewards(playerName: string): void {
  world.setDynamicProperty(rewardsKey(playerName), 0);
}

export function cancelSale(player: Player, entity: Entity): void {
  const typeId     = entity.getDynamicProperty(P_ITEM)   as string | undefined;
  const sellerName = entity.getDynamicProperty(P_SELLER) as string | undefined;
  const amount     = (entity.getDynamicProperty(P_AMOUNT) as number | undefined) ?? 0;
  const entityInv  = getEntityInv(entity);

  if (amount > 0 && entityInv) {
    const seller = world.getAllPlayers().find(p => p.name === sellerName);
    for (let i = 0; i < entityInv.size; i++) {
      const it = entityInv.getItem(i);
      if (!it) continue;
      if (seller) {
        const left = getPlayerInv(seller)?.addItem(it.clone());
        if (left) entity.dimension.spawnItem(left, seller.location);
      } else {
        entity.dimension.spawnItem(it, entity.location);
      }
      entityInv.setItem(i, undefined);
    }
  }

  if (typeId) clearEquip(entity, typeId);
  entity.setDynamicProperty(P_ITEM,      undefined);
  entity.setDynamicProperty(P_AMOUNT,    undefined);
  entity.setDynamicProperty(P_PRICE,     undefined);
  entity.setDynamicProperty(P_SELLER,    undefined);
  entity.setDynamicProperty(P_SHOP_NAME, undefined);
  entity.setDynamicProperty(P_ITEM_DATA, undefined);
  entity.nameTag = DEFAULT_NAME;
  player.sendMessage("§aVente annulée. Items retournés.");
}

export function deleteShop(player: Player, entity: Entity): void {
  const loc = entity.location;
  const dim = entity.dimension;
  const entityInv = getEntityInv(entity);
  if (entityInv) {
    for (let i = 0; i < entityInv.size; i++) {
      const it = entityInv.getItem(i);
      if (it) { dim.spawnItem(it, loc); entityInv.setItem(i, undefined); }
    }
  }
  dim.spawnItem(new ItemStack(SHOP_ITEM, 1), { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
  try {
    const block = dim.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
    if (block?.typeId === SHOP_BLOCK) block.setPermutation(BlockPermutation.resolve("minecraft:air"));
  } catch {}
  try { entity.remove(); } catch {}
  player.sendMessage("§aShop supprimé.");
}

export function handleBuyItem(buyer: Player, entity: Entity, qty: number): void {
  const typeId      = entity.getDynamicProperty(P_ITEM)      as string;
  const amount      = (entity.getDynamicProperty(P_AMOUNT)   as number | undefined) ?? 0;
  const price       = entity.getDynamicProperty(P_PRICE)     as number;
  const sellerName  = entity.getDynamicProperty(P_SELLER)    as string;
  const shopName    = entity.getDynamicProperty(P_SHOP_NAME) as string;
  const itemDataStr = entity.getDynamicProperty(P_ITEM_DATA) as string | undefined;
  const itemName    = getItemName(itemDataStr, typeId);

  if (!typeId || !price || !sellerName) { buyer.sendMessage("§cShop non configuré."); return; }
  if (amount < qty) { buyer.sendMessage("§cStock insuffisant."); return; }

  const totalCost = price * qty;
  if (!removeBalance(buyer, totalCost)) { buyer.sendMessage(`§cSolde insuffisant (${fmtNC(totalCost)} requis).`); return; }

  const entityInv = getEntityInv(entity);
  if (!entityInv) { addBalance(buyer, totalCost); return; }

  let remaining = qty;
  for (let i = 0; i < entityInv.size && remaining > 0; i++) {
    const it = entityInv.getItem(i);
    if (!it || it.typeId !== typeId) continue;
    const take = Math.min(it.amount, remaining);
    entityInv.setItem(i, take >= it.amount ? undefined : new ItemStack(typeId, it.amount - take));
    remaining -= take;
  }

  if (remaining > 0) {
    entityInv.addItem(new ItemStack(typeId, qty - remaining));
    addBalance(buyer, totalCost);
    buyer.sendMessage("§cErreur de transfert, remboursé.");
    return;
  }

  const leftover = giveItemsToPlayer(buyer, typeId, qty);
  if (leftover > 0) {
    entityInv.addItem(new ItemStack(typeId, qty));
    addBalance(buyer, totalCost);
    buyer.sendMessage("§cInventaire plein. Achat annulé.");
    return;
  }

  const newAmount = amount - qty;
  entity.setDynamicProperty(P_AMOUNT, newAmount);
  entity.nameTag = buildNameTag(shopName, itemName, newAmount, price);

  if (newAmount <= 0) {
    clearEquip(entity, typeId);
    entity.setDynamicProperty(P_ITEM,      undefined);
    entity.setDynamicProperty(P_AMOUNT,    undefined);
    entity.setDynamicProperty(P_PRICE,     undefined);
    entity.setDynamicProperty(P_SELLER,    undefined);
    entity.setDynamicProperty(P_SHOP_NAME, undefined);
    entity.setDynamicProperty(P_ITEM_DATA, undefined);
    entity.nameTag = DEFAULT_NAME;
  }

  addRewards(sellerName, totalCost);
  buyer.sendMessage(`§aAchat : §f${qty}× ${itemName} §apour §e${fmtNC(totalCost)}§a.`);
  world.getAllPlayers().find(p => p.name === sellerName)
    ?.sendMessage(`§6[Shop] §e${buyer.name} §6a acheté §f${qty}× ${itemName}§6 dans §f"${shopName}"§6.`);
}

export function collectRewards(player: Player): void {
  const rewards = getRewards(player.name);
  if (rewards <= 0) { player.sendMessage("§cAucun gain à collecter."); return; }
  addBalance(player, rewards);
  clearRewards(player.name);
  player.sendMessage(`§aGains collectés : §e${fmtNC(rewards)}§a.`);
}
