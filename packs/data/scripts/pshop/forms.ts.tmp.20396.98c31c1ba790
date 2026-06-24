import { system, Player, type Entity, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { showFormWithRetry } from "~/common/form-utils.ts";
import { showConfirmForm } from "~/common/confirm.ts";
import { fmtNC } from "~/common/economy.ts";
import {
  SHOP_BLOCK, P_ITEM, P_AMOUNT, P_PRICE, P_SELLER, P_SHOP_NAME, P_ITEM_DATA,
  MAX_STOCK, formatItemName, buildNameTag, getItemName, padForm,
} from "./constants.ts";
import {
  getPlayerInv, getEntityInv, countFreeSpace,
  equipItem, getRewards, cancelSale, deleteShop, handleBuyItem, collectRewards,
} from "./helpers.ts";

// ── Shop vide (propriétaire) ──────────────────────────────────────────────────

export async function showEmptyShopOptions(player: Player, entity: Entity): Promise<void> {
  const form = new ActionFormData()
    .title("§6§lItem Shop")
    .body("§fCe shop est vide. Configurez-le pour commencer à vendre.")
    .button("§a§lMettre en vente", "textures/items/emerald")
    .button("§c§lSupprimer le shop", "textures/ui/trash_default");

  padForm(form, 2);
  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) return;

  if (r.selection === 0) system.run(async () => { await showSellForm(player, entity); });
  else if (r.selection === 1) {
    const ok = await showConfirmForm(player, "Supprimer ce shop et récupérer les items ?", "Supprimer le shop");
    if (ok) system.run(() => deleteShop(player, entity));
  }
}

// ── Configuration de la vente (2 étapes) ─────────────────────────────────────

export async function showSellForm(player: Player, entity: Entity): Promise<void> {
  const inv = getPlayerInv(player);
  if (!inv) return;

  const items: { typeId: string; amount: number; nameTag?: string; lore?: string[]; label: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < inv.size && items.length < 30; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId === SHOP_BLOCK) continue;
    const key = it.typeId + (it.nameTag ?? "");
    const existing = items.find(x => x.typeId === it.typeId && x.nameTag === it.nameTag);
    if (seen.has(key)) { if (existing) existing.amount += it.amount; continue; }
    seen.add(key);
    items.push({
      typeId: it.typeId,
      amount: it.amount,
      nameTag: it.nameTag ?? undefined,
      lore: it.getLore() ?? undefined,
      label: it.nameTag || formatItemName(it.typeId),
    });
  }

  if (items.length === 0) { player.sendMessage("§cAucun item dans votre inventaire."); return; }

  const r1 = await new ModalFormData()
    .title("§6§lMettre en vente — 1/2")
    .dropdown("Item à vendre", items.map(i => `${i.label}  ×${i.amount}`))
    .show(player);

  if (r1.canceled || !r1.formValues) return;
  const selected = items[r1.formValues[0] as number];
  if (!selected) return;

  const r2 = await new ModalFormData()
    .title("§6§lMettre en vente — 2/2")
    .textField("Nom du shop", `Shop de ${player.name}`)
    .textField("Prix par item (NC)", "100")
    .show(player);

  if (r2.canceled || !r2.formValues) return;
  const shopName = ((r2.formValues[0] as string) ?? "").trim() || `Shop de ${player.name}`;
  const price    = parseInt(r2.formValues[1] as string);

  if (isNaN(price) || price <= 0) { player.sendMessage("§cPrix invalide."); return; }

  system.run(() => {
    entity.setDynamicProperty(P_ITEM,      selected.typeId);
    entity.setDynamicProperty(P_AMOUNT,    0);
    entity.setDynamicProperty(P_PRICE,     price);
    entity.setDynamicProperty(P_SELLER,    player.name);
    entity.setDynamicProperty(P_SHOP_NAME, shopName);
    entity.setDynamicProperty(P_ITEM_DATA, JSON.stringify({ typeId: selected.typeId, nameTag: selected.nameTag ?? null, lore: selected.lore ?? [] }));
    entity.nameTag = buildNameTag(shopName, selected.label, 0, price);
    equipItem(entity, selected.typeId);
    player.sendMessage(`§aShop configuré ! Ajoutez du stock via le menu.`);
  });
}

// ── Vue vendeur ───────────────────────────────────────────────────────────────

export async function showSellerOptionsForm(player: Player, entity: Entity): Promise<void> {
  const typeId     = entity.getDynamicProperty(P_ITEM)      as string;
  const amount     = (entity.getDynamicProperty(P_AMOUNT)   as number | undefined) ?? 0;
  const price      = entity.getDynamicProperty(P_PRICE)     as number;
  const shopName   = entity.getDynamicProperty(P_SHOP_NAME) as string;
  const itemDataStr = entity.getDynamicProperty(P_ITEM_DATA) as string | undefined;
  const itemName   = getItemName(itemDataStr, typeId);
  const rewards    = getRewards(player.name);

  const form = new ActionFormData()
    .title(`§6§l${shopName}`)
    .body(`§f${itemName}  ×§e${amount}\n§fPrix : §e${fmtNC(price)}§f/item\n§fGains en attente : §e${fmtNC(rewards)}`)
    .button("§a§l+ Ajouter du stock",      "textures/ui/confirm")
    .button("§f- Retirer du stock",         "textures/ui/cancel")
    .button(`§e§lCollect. ventes §a${fmtNC(rewards)}`, "textures/items/gold_ingot")
    .button("§cAnnuler la vente",           "textures/ui/refresh_light")
    .button("§c§lSupprimer le shop",        "textures/ui/trash_default");

  padForm(form, 5);
  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) return;

  if      (r.selection === 0) system.run(async () => { await showAddStockMenu(player, entity); });
  else if (r.selection === 1) system.run(async () => { await showRemoveStockMenu(player, entity); });
  else if (r.selection === 2) system.run(() => collectRewards(player));
  else if (r.selection === 3) {
    const ok = await showConfirmForm(player, `Annuler la vente de §f${itemName}§r et récupérer le stock ?`, "Annuler la vente");
    if (ok) system.run(() => cancelSale(player, entity));
  }
  else if (r.selection === 4) {
    const ok = await showConfirmForm(player, "Supprimer ce shop et récupérer tous les items ?", "Supprimer le shop");
    if (ok) system.run(() => deleteShop(player, entity));
  }
}

// ── Ajouter du stock ──────────────────────────────────────────────────────────

export async function showAddStockMenu(player: Player, entity: Entity): Promise<void> {
  const typeId  = entity.getDynamicProperty(P_ITEM)   as string;
  const current = (entity.getDynamicProperty(P_AMOUNT) as number | undefined) ?? 0;
  const space   = MAX_STOCK - current;
  if (space <= 0) { player.sendMessage(`§cStock plein (max ${MAX_STOCK}).`); return; }

  const inv = getPlayerInv(player);
  if (!inv) return;
  let playerHas = 0;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (it?.typeId === typeId) playerHas += it.amount;
  }
  if (playerHas === 0) { player.sendMessage(`§cVous n'avez pas de §f${formatItemName(typeId)}§c.`); return; }

  const maxAdd = Math.min(playerHas, space);
  const r = await new ModalFormData()
    .title("§6§lAjouter du stock")
    .slider(`§f${formatItemName(typeId)}\n§7Stock actuel : ${current}  |  Espace : ${space}\nQuantité à ajouter`, 1, maxAdd)
    .show(player);

  if (r.canceled || !r.formValues) return;
  const qty = r.formValues[0] as number;

  system.run(() => {
    const inv2 = getPlayerInv(player);
    const entityInv = getEntityInv(entity);
    if (!inv2 || !entityInv) return;

    let remaining = qty;
    for (let i = 0; i < inv2.size && remaining > 0; i++) {
      const it = inv2.getItem(i);
      if (!it || it.typeId !== typeId) continue;
      const take = Math.min(it.amount, remaining);
      const toGive = it.clone(); toGive.amount = take;
      const leftover = entityInv.addItem(toGive);
      if (leftover) break;
      inv2.setItem(i, take >= it.amount ? undefined : new ItemStack(it.typeId, it.amount - take));
      remaining -= take;
    }

    const taken = qty - remaining;
    if (taken === 0) { player.sendMessage("§cErreur lors du transfert."); return; }

    const newAmount  = current + taken;
    entity.setDynamicProperty(P_AMOUNT, newAmount);
    const shopName   = entity.getDynamicProperty(P_SHOP_NAME) as string;
    const price      = entity.getDynamicProperty(P_PRICE)     as number;
    const itemDataStr = entity.getDynamicProperty(P_ITEM_DATA) as string | undefined;
    entity.nameTag = buildNameTag(shopName, getItemName(itemDataStr, typeId), newAmount, price);
    player.sendMessage(`§a+${taken} §f${formatItemName(typeId)} §aajouté(s). Stock : §e${newAmount}§a.`);
  });
}

// ── Retirer du stock ──────────────────────────────────────────────────────────

export async function showRemoveStockMenu(player: Player, entity: Entity): Promise<void> {
  const current = (entity.getDynamicProperty(P_AMOUNT) as number | undefined) ?? 0;
  if (current <= 0) { player.sendMessage("§cStock vide."); return; }

  const typeId = entity.getDynamicProperty(P_ITEM) as string;
  const r = await new ModalFormData()
    .title("§6§lRetirer du stock")
    .slider(`§f${formatItemName(typeId)}\n§7Stock actuel : ${current}\nQuantité à retirer`, 1, current)
    .show(player);

  if (r.canceled || !r.formValues) return;
  const qty = r.formValues[0] as number;

  system.run(() => {
    const entityInv = getEntityInv(entity);
    const playerInv = getPlayerInv(player);
    if (!entityInv || !playerInv) return;

    let remaining = qty;
    for (let i = 0; i < entityInv.size && remaining > 0; i++) {
      const it = entityInv.getItem(i);
      if (!it || it.typeId !== typeId) continue;
      const take = Math.min(it.amount, remaining);
      const toGive = it.clone(); toGive.amount = take;
      const left = playerInv.addItem(toGive);
      if (left) player.dimension.spawnItem(left, player.location);
      entityInv.setItem(i, take >= it.amount ? undefined : new ItemStack(it.typeId, it.amount - take));
      remaining -= take;
    }

    const taken = qty - remaining;
    const newAmount = current - taken;
    entity.setDynamicProperty(P_AMOUNT, newAmount);
    const shopName    = entity.getDynamicProperty(P_SHOP_NAME) as string;
    const price       = entity.getDynamicProperty(P_PRICE)     as number;
    const itemDataStr = entity.getDynamicProperty(P_ITEM_DATA) as string | undefined;
    entity.nameTag = buildNameTag(shopName, getItemName(itemDataStr, typeId), newAmount, price);
    player.sendMessage(`§a${taken} §f${formatItemName(typeId)} §aretirés. Stock : §e${newAmount}§a.`);
  });
}

// ── Achat (slider quantité → confirm) ────────────────────────────────────────

export async function showBuyForm(buyer: Player, entity: Entity): Promise<void> {
  const typeId      = entity.getDynamicProperty(P_ITEM)      as string;
  const amount      = (entity.getDynamicProperty(P_AMOUNT)   as number | undefined) ?? 0;
  const price       = entity.getDynamicProperty(P_PRICE)     as number;
  const sellerName  = entity.getDynamicProperty(P_SELLER)    as string;
  const shopName    = entity.getDynamicProperty(P_SHOP_NAME) as string;
  const itemDataStr = entity.getDynamicProperty(P_ITEM_DATA) as string | undefined;
  const itemName    = getItemName(itemDataStr, typeId);

  if (!typeId || !price || !sellerName) { buyer.sendMessage("§cShop non configuré."); return; }
  if (amount <= 0) { buyer.sendMessage("§cRupture de stock."); return; }

  const maxQty = Math.min(amount, countFreeSpace(buyer, typeId));
  if (maxQty <= 0) { buyer.sendMessage("§cInventaire plein ou stock insuffisant."); return; }

  const r = await new ModalFormData()
    .title(`§6§l${shopName}`)
    .slider(
      `§f${itemName}\n§7Vendeur : §f${sellerName}\n§7Stock : §e${amount}  §7|  §7Prix : §e${fmtNC(price)}/item\nQuantité`,
      1, maxQty
    )
    .show(buyer);

  if (r.canceled || !r.formValues) return;
  const qty       = r.formValues[0] as number;
  const totalCost = price * qty;

  const ok = await showConfirmForm(
    buyer,
    `§fAcheter §e${qty}× ${itemName}\n§fTotal : §e${fmtNC(totalCost)}`,
    `Confirmer l'achat`
  );
  if (!ok) return;

  system.run(() => handleBuyItem(buyer, entity, qty));
}
