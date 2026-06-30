import { system, Player, Entity, ItemStack } from "@minecraft/server";
import { Panel, Screen, Text, render, useExit, useState, type JSX } from "@bedrock-core/ui";
import { Scaffold } from "../common/scaffold.tsx";
import { TitleBar, InfoBox, SaBtn, BG_BODY, BG_PANEL } from "../common/ui.tsx";
import { WideIconBtn, StyledInput, StyledSlider, StyledDropdown } from "../common/components.tsx";
import { fmtNC } from "../common/economy.ts";
import {
  SHOP_BLOCK, P_ITEM, P_AMOUNT, P_PRICE, P_SELLER, P_SHOP_NAME, P_ITEM_DATA,
  MAX_STOCK, formatItemName, buildNameTag, getItemName,
} from "./constants.ts";
import {
  getPlayerInv, getEntityInv, countFreeSpace,
  equipItem, getRewards, cancelSale, deleteShop, handleBuyItem, collectRewards,
} from "./helpers.ts";

const W = 260;
const WC = W - 8;

// ── Shop vide (propriétaire) ──────────────────────────────────────────────────

export function showEmptyShopOptions(player: Player, entity: Entity): void {
  render(function EmptyShopForm() {
    const exit = useExit();
    const [confirm, setConfirm] = useState(false);

    if (confirm) {
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Supprimer le shop" w={W} onClose={exit} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text="Supprimer ce shop et récupérer les items ?" w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cSupprimer" onPress={() => { system.run(() => deleteShop(player, entity)); exit(); }} />,
                        <SaBtn label="Annuler" onPress={() => setConfirm(false)} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Item Shop" w={W} onClose={exit} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {[
                  <InfoBox text="Ce shop est vide. Configurez-le pour commencer." w={WC} />,
                  <Panel width={WC} flexDirection="column" gap={4} marginTop={4}>
                    {[
                      <SaBtn label="§a§l+ Mettre en vente" width={WC} onPress={() => { exit(); system.run(() => showSellForm(player, entity)); }} />,
                      <SaBtn label="§c§lSupprimer le shop" width={WC} onPress={() => setConfirm(true)} />,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}

// ── Configuration de la vente ─────────────────────────────────────────────────

export function showSellForm(player: Player, entity: Entity): void {
  const inv = getPlayerInv(player);
  if (!inv) return;

  type ItemEntry = { typeId: string; amount: number; nameTag?: string; lore?: string[]; label: string };
  const items: ItemEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < inv.size && items.length < 30; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId === SHOP_BLOCK) continue;
    const key = it.typeId + (it.nameTag ?? "");
    const existing = items.find(x => x.typeId === it.typeId && x.nameTag === it.nameTag);
    if (seen.has(key)) { if (existing) existing.amount += it.amount; continue; }
    seen.add(key);
    items.push({
      typeId: it.typeId, amount: it.amount,
      nameTag: it.nameTag ?? undefined, lore: it.getLore() ?? undefined,
      label: it.nameTag || formatItemName(it.typeId),
    });
  }

  if (items.length === 0) { player.sendMessage("§cAucun item dans votre inventaire."); return; }

  const optionLabels = items.map(i => `${i.label}  ×${i.amount}`);

  render(function SellForm() {
    const exit = useExit();
    const [selIdx,    setSelIdx]    = useState(0);
    const [shopName,  setShopName]  = useState(`Shop de ${player.name}`);
    const [priceStr,  setPriceStr]  = useState("100");

    const selected = items[selIdx];

    const confirm = () => {
      const price = parseInt(priceStr);
      if (isNaN(price) || price <= 0) { player.sendMessage("§cPrix invalide."); return; }
      system.run(() => {
        entity.setDynamicProperty(P_ITEM,      selected.typeId);
        entity.setDynamicProperty(P_AMOUNT,    0);
        entity.setDynamicProperty(P_PRICE,     price);
        entity.setDynamicProperty(P_SELLER,    player.name);
        entity.setDynamicProperty(P_SHOP_NAME, shopName || `Shop de ${player.name}`);
        entity.setDynamicProperty(P_ITEM_DATA, JSON.stringify({ typeId: selected.typeId, nameTag: selected.nameTag ?? null, lore: selected.lore ?? [] }));
        entity.nameTag = buildNameTag(shopName, selected.label, 0, price);
        equipItem(entity, selected.typeId);
        player.sendMessage("§aShop configuré ! Ajoutez du stock via le menu.");
      });
      exit();
    };

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Mettre en vente" w={W} onClose={exit} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {[
                  <StyledDropdown
                    width={WC} height={24} background={BG_PANEL}
                    label="Item à vendre" options={optionLabels}
                    value={optionLabels[selIdx]}
                    onChange={(_, idx) => setSelIdx(idx)}
                    face={<Text scale={0.5}>{`§f${selected.label}  ×${selected.amount}`}</Text>}
                  />,
                  <StyledInput
                    width={WC} height={24} background={BG_PANEL}
                    label="Nom du shop" placeholder={`Shop de ${player.name}`}
                    value={shopName} onChange={setShopName}
                  />,
                  <StyledInput
                    width={WC} height={24} background={BG_PANEL}
                    label="Prix par item (NC)" placeholder="100"
                    value={priceStr} onChange={setPriceStr}
                  />,
                  <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                    {[
                      <SaBtn label="§a§lConfirmer" onPress={confirm} />,
                      <SaBtn label="Annuler" onPress={exit} />,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}

// ── Options vendeur ───────────────────────────────────────────────────────────

export function showSellerOptionsForm(player: Player, entity: Entity): void {
  render(function SellerForm() {
    const exit = useExit();
    type V = "main" | "add_stock" | "remove_stock" | "confirm_cancel" | "confirm_delete";
    const [view,       setView]       = useState<V>("main");
    const [addMax,     setAddMax]     = useState(1);
    const [addQty,     setAddQty]     = useState(1);
    const [removeQty,  setRemoveQty]  = useState(1);
    const [removeCurr, setRemoveCurr] = useState(0);

    const typeId    = entity.getDynamicProperty(P_ITEM)      as string;
    const amount    = (entity.getDynamicProperty(P_AMOUNT)   as number | undefined) ?? 0;
    const price     = entity.getDynamicProperty(P_PRICE)     as number;
    const shopName  = entity.getDynamicProperty(P_SHOP_NAME) as string;
    const dataStr   = entity.getDynamicProperty(P_ITEM_DATA) as string | undefined;
    const itemName  = getItemName(dataStr, typeId);
    const rewards   = getRewards(player.name);

    // ── Ajouter du stock ─────────────────────────────────────────────
    if (view === "add_stock") {
      const doAdd = () => {
        system.run(() => {
          const inv2 = getPlayerInv(player);
          const eInv = getEntityInv(entity);
          if (!inv2 || !eInv) return;
          let rem = addQty;
          for (let i = 0; i < inv2.size && rem > 0; i++) {
            const it = inv2.getItem(i);
            if (!it || it.typeId !== typeId) continue;
            const take = Math.min(it.amount, rem);
            const toGive = it.clone(); toGive.amount = take;
            const leftover = eInv.addItem(toGive);
            if (leftover) break;
            inv2.setItem(i, take >= it.amount ? undefined : new ItemStack(it.typeId, it.amount - take));
            rem -= take;
          }
          const taken = addQty - rem;
          if (taken === 0) { player.sendMessage("§cErreur lors du transfert."); return; }
          const newAmt = amount + taken;
          entity.setDynamicProperty(P_AMOUNT, newAmt);
          entity.nameTag = buildNameTag(shopName, itemName, newAmt, price);
          player.sendMessage(`§a+${taken} §f${formatItemName(typeId)} §aajouté(s). Stock : §e${newAmt}§a.`);
        });
        exit();
      };

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Ajouter du stock" w={W} onClose={exit} onBack={() => setView("main")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`${itemName} — Stock : ${amount} | Espace : ${MAX_STOCK - amount}`} w={WC} />,
                    <StyledSlider
                      width={WC} height={24} background={BG_PANEL}
                      label="Quantité à ajouter"
                      min={1} max={addMax} value={addQty} onChange={setAddQty}
                    />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aAjouter" onPress={doAdd} />,
                        <SaBtn label="Retour" onPress={() => setView("main")} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Retirer du stock ─────────────────────────────────────────────
    if (view === "remove_stock") {
      const doRemove = () => {
        system.run(() => {
          const eInv   = getEntityInv(entity);
          const pInv   = getPlayerInv(player);
          if (!eInv || !pInv) return;
          let rem = removeQty;
          for (let i = 0; i < eInv.size && rem > 0; i++) {
            const it = eInv.getItem(i);
            if (!it || it.typeId !== typeId) continue;
            const take = Math.min(it.amount, rem);
            const toGive = it.clone(); toGive.amount = take;
            const left = pInv.addItem(toGive);
            if (left) player.dimension.spawnItem(left, player.location);
            eInv.setItem(i, take >= it.amount ? undefined : new ItemStack(it.typeId, it.amount - take));
            rem -= take;
          }
          const taken = removeQty - rem;
          const newAmt = removeCurr - taken;
          entity.setDynamicProperty(P_AMOUNT, newAmt);
          entity.nameTag = buildNameTag(shopName, itemName, newAmt, price);
          player.sendMessage(`§a${taken} §f${formatItemName(typeId)} §aretirés. Stock : §e${newAmt}§a.`);
        });
        exit();
      };

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Retirer du stock" w={W} onClose={exit} onBack={() => setView("main")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`${itemName} — Stock : ${removeCurr}`} w={WC} />,
                    <StyledSlider
                      width={WC} height={24} background={BG_PANEL}
                      label="Quantité à retirer"
                      min={1} max={removeCurr} value={removeQty} onChange={setRemoveQty}
                    />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cRetirer" onPress={doRemove} />,
                        <SaBtn label="Retour" onPress={() => setView("main")} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Confirmations ─────────────────────────────────────────────────
    if (view === "confirm_cancel" || view === "confirm_delete") {
      const isCancel = view === "confirm_cancel";
      const msg  = isCancel
        ? `Annuler la vente de §f${itemName}§r et récupérer le stock ?`
        : "Supprimer ce shop et récupérer tous les items ?";
      const title = isCancel ? "Annuler la vente" : "Supprimer le shop";
      const onOk  = isCancel
        ? () => { system.run(() => cancelSale(player, entity)); exit(); }
        : () => { system.run(() => deleteShop(player, entity)); exit(); };

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={title} w={W} onClose={exit} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={msg} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cConfirmer" onPress={onOk} />,
                        <SaBtn label="Annuler" onPress={() => setView("main")} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Vue principale vendeur ────────────────────────────────────────
    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title={shopName} w={W} onClose={exit} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {[
                  <InfoBox text={`${itemName}  ×${amount} — ${fmtNC(price)}/item`} w={WC} />,
                  <InfoBox text={`Gains en attente : §a${fmtNC(rewards)}`} w={WC} />,
                  <Panel width={WC} flexDirection="column" gap={4} marginTop={4}>
                    {[
                      <WideIconBtn label="§a+ Ajouter du stock" icon="textures/ui/confirm" width={WC} onPress={() => {
                        const inv = getPlayerInv(player);
                        let playerHas = 0;
                        if (inv) for (let i = 0; i < inv.size; i++) { const it = inv.getItem(i); if (it?.typeId === typeId) playerHas += it.amount; }
                        if (playerHas === 0) { player.sendMessage(`§cVous n'avez pas de §f${formatItemName(typeId)}.`); return; }
                        const space = MAX_STOCK - amount;
                        if (space <= 0) { player.sendMessage("§cStock plein."); return; }
                        setAddMax(Math.min(playerHas, space));
                        setAddQty(1);
                        setView("add_stock");
                      }} />,
                      <WideIconBtn label="§f- Retirer du stock" icon="textures/ui/cancel" width={WC} onPress={() => {
                        if (amount <= 0) { player.sendMessage("§cStock vide."); return; }
                        setRemoveCurr(amount);
                        setRemoveQty(1);
                        setView("remove_stock");
                      }} />,
                      <WideIconBtn label={`§e§lCollect. §a${fmtNC(rewards)}`} icon="textures/items/gold_ingot" width={WC} onPress={() => { system.run(() => collectRewards(player)); exit(); }} />,
                      <WideIconBtn label="§cAnnuler la vente" icon="textures/ui/refresh_light" width={WC} onPress={() => setView("confirm_cancel")} />,
                      <WideIconBtn label="§c§lSupprimer le shop" icon="textures/ui/trash_default" width={WC} onPress={() => setView("confirm_delete")} />,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}

// ── Achat ─────────────────────────────────────────────────────────────────────

export function showBuyForm(buyer: Player, entity: Entity): void {
  const typeId     = entity.getDynamicProperty(P_ITEM)      as string;
  const amount     = (entity.getDynamicProperty(P_AMOUNT)   as number | undefined) ?? 0;
  const price      = entity.getDynamicProperty(P_PRICE)     as number;
  const sellerName = entity.getDynamicProperty(P_SELLER)    as string;
  const shopName   = entity.getDynamicProperty(P_SHOP_NAME) as string;
  const dataStr    = entity.getDynamicProperty(P_ITEM_DATA) as string | undefined;
  const itemName   = getItemName(dataStr, typeId);

  if (!typeId || !price || !sellerName) { buyer.sendMessage("§cShop non configuré."); return; }
  if (amount <= 0)                      { buyer.sendMessage("§cRupture de stock."); return; }

  const maxQty = Math.min(amount, countFreeSpace(buyer, typeId));
  if (maxQty <= 0) { buyer.sendMessage("§cInventaire plein ou stock insuffisant."); return; }

  render(function BuyForm() {
    const exit = useExit();
    const [qty,     setQty]     = useState(1);
    const [confirm, setConfirm] = useState(false);

    const total = price * qty;

    if (confirm) {
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Confirmer l'achat" w={W} onClose={exit} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Acheter §e${qty}× ${itemName}`} w={WC} />,
                    <InfoBox text={`Total : §e${fmtNC(total)}`} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aAcheter" onPress={() => { system.run(() => handleBuyItem(buyer, entity, qty)); exit(); }} />,
                        <SaBtn label="Annuler" onPress={() => setConfirm(false)} />,
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title={shopName} w={W} onClose={exit} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {[
                  <InfoBox text={`${itemName} — Vendeur : §f${sellerName}`} w={WC} />,
                  <InfoBox text={`Stock : §e${amount} | Prix : §e${fmtNC(price)}§r/item`} w={WC} />,
                  <StyledSlider
                    width={WC} height={24} background={BG_PANEL}
                    label="Quantité"
                    min={1} max={maxQty} value={qty} onChange={setQty}
                  />,
                  <InfoBox text={`Total : §e${fmtNC(total)}`} w={WC} />,
                  <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                    {[
                      <SaBtn label="§aAcheter" onPress={() => setConfirm(true)} />,
                      <SaBtn label="Annuler" onPress={exit} />,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, buyer, Screen.Scroll);
}
