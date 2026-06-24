import { world, system, Player, ItemStack, EntityComponentTypes, type EntityInventoryComponent, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { showFormWithRetry } from "~/common/form-utils.ts";
import { getBalance, removeBalance, fmtNC } from "~/common/economy.ts";
import { SHOP_CONFIG, type ShopConfigItem } from "./shop_config.ts";

const SHOP_MAIN_TAG     = "§7§1§a";
const SHOP_ITEM_TAG     = "§7§1§b";
const SHOP_CAG_LIST_TAG = "§7§1§c";
const SHOP_CAG_DETAIL_TAG = "§7§1§d";

const SHOP_KEY      = "shuuaddons:shop";
const CAGNOTTES_KEY = "shuuaddons:cagnottes";

interface ShopItem {
  id: string;
  label?: string;
  category: string;
  buy: number;
  sell: number;
  amount: number;
}

interface Cagnotte {
  id: string;
  name: string;
  target: number;
  current: number;
  type: "nether" | "end" | "event";
  eventName?: string;
  done: boolean;
  contributors: Record<string, number>;
}

function getShopItems(): ShopItem[] {
  const raw = world.getDynamicProperty(SHOP_KEY);
  const overrides = typeof raw === "string" ? (JSON.parse(raw) as ShopItem[]) : [];
  const overrideMap = new Map(overrides.map((i) => [i.id, i]));
  const base: ShopItem[] = (SHOP_CONFIG as ShopConfigItem[]).map((cfg) => {
    if (!overrideMap.has(cfg.id)) return cfg;
    const ov = overrideMap.get(cfg.id)!;
    return { ...ov, label: ov.label ?? cfg.label };
  });
  const baseIds = new Set(base.map((i) => i.id));
  return [...base, ...overrides.filter((i) => !baseIds.has(i.id))];
}

function setShopItems(items: ShopItem[]): void {
  const configMap = new Map((SHOP_CONFIG as ShopConfigItem[]).map((c) => [c.id, c]));
  const toSave = items.filter((item) => {
    const base = configMap.get(item.id);
    if (!base) return true;
    return base.buy !== item.buy || base.sell !== item.sell || base.amount !== item.amount || base.category !== item.category;
  });
  world.setDynamicProperty(SHOP_KEY, JSON.stringify(toSave));
}

function getCagnottes(): Cagnotte[] {
  const raw = world.getDynamicProperty(CAGNOTTES_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as Cagnotte[]) : [];
}

function setCagnottes(list: Cagnotte[]): void {
  world.setDynamicProperty(CAGNOTTES_KEY, JSON.stringify(list));
}

function getItemLabel(item: ShopItem): string {
  if (item.label) return item.label;
  return item.id.replace(/^[^:]+:/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemIconPath(typeId: string): string {
  return "textures/items/" + typeId.replace(/^[^:]+:/, "");
}

// ── Menu principal shop ───────────────────────────────────────────────────────

export async function showShop(player: Player): Promise<void> {
  const items = getShopItems().filter((i) => i.buy > 0);
  if (items.length === 0) { player.sendMessage("§cLe shop est vide."); return; }

  const activeCagnottes = getCagnottes().filter((c) => !c.done);
  const bal = getBalance(player);

  const form = new ActionFormData()
    .title(`§6§lSHOP§r${SHOP_MAIN_TAG}`)
    .body(`§e${fmtNC(bal)}`);

  for (const item of items)
    form.button(`§f${getItemLabel(item)}\n§e${fmtNC(item.buy)}`, itemIconPath(item.id));

  form.button(`§6§lCagnottes\n§f${activeCagnottes.length} active(s)`, "textures/items/diamond");

  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) return;

  if (r.selection === items.length) {
    system.run(async () => { await showCagnottesMenu(player); });
  } else {
    system.run(async () => { await showShopItem(player, items[r.selection!]); });
  }
}

// ── Cagnottes ─────────────────────────────────────────────────────────────────

async function showCagnottesMenu(player: Player): Promise<void> {
  const list = getCagnottes().filter((c) => !c.done);

  const form = new ActionFormData()
    .title(`§6§lCagnottes§r${SHOP_CAG_LIST_TAG}`)
    .body(list.length > 0 ? "§fObjectifs communautaires actifs :" : "§fAucune cagnotte active.");

  for (const c of list) {
    const pct = Math.min(100, Math.floor((c.current / c.target) * 100));
    form.button(`§e§l${c.name}\n§e${fmtNC(c.current)} / §e${fmtNC(c.target)}`, `textures/custom_ui/bars/pct_${pct}`);
  }

  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) {
    system.run(async () => { await showShop(player); });
    return;
  }
  system.run(async () => { await showCagnotteDetail(player, list[r.selection!]); });
}

async function showCagnotteDetail(player: Player, cagnotte: Cagnotte): Promise<void> {
  const pct = Math.min(100, Math.floor((cagnotte.current / cagnotte.target) * 100));
  const medals = ["§6§l1.", "§7§l2.", "§c§l3."];
  const contribs = Object.entries(cagnotte.contributors ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topTxt = contribs.length > 0
    ? contribs.map(([name, nc], i) => `${medals[i]} §r§f${name}  §e${fmtNC(nc)}`).join("\n")
    : "§7Aucun contributeur encore.";

  const form = new ActionFormData()
    .title(`§6§l${cagnotte.name}§r${SHOP_CAG_DETAIL_TAG}`)
    .body(`§e§lTop contributeurs§r\n\n${topTxt}`)
    .button(`§e${fmtNC(cagnotte.current)} §f/ §e${fmtNC(cagnotte.target)}`, `textures/custom_ui/bars/pct_${pct}`)
    .button("§a§lContribuer", "textures/items/diamond")
    .button("§bRetour", "textures/ui/arrow_left");

  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined || r.selection === 0) return;
  if (r.selection === 2) { system.run(async () => { await showCagnottesMenu(player); }); return; }
  system.run(async () => { await showContributeModal(player, cagnotte); });
}

async function showContributeModal(player: Player, cagnotte: Cagnotte): Promise<void> {
  const bal    = getBalance(player);
  const needed = cagnotte.target - cagnotte.current;

  const r = await new ModalFormData()
    .title(`§6§lContribuer — §f${cagnotte.name}`)
    .textField(`§fMontant en NC  §7(Solde : §e${fmtNC(bal)} §7| Restant : §e${fmtNC(needed)}§7)`, "§7100")
    .show(player);

  if (r.canceled || !r.formValues) return;
  const montant = parseInt(r.formValues[0] as string);

  system.run(async () => {
    if (isNaN(montant) || montant <= 0) { player.sendMessage("§cMontant invalide."); return; }
    const list = getCagnottes();
    const c = list.find((x) => x.id === cagnotte.id && !x.done);
    if (!c) { player.sendMessage("§cCagnotte introuvable ou déjà terminée."); return; }

    const actual = Math.min(montant, c.target - c.current);
    if (!removeBalance(player, actual)) { player.sendMessage("§cSolde insuffisant."); return; }

    c.current += actual;
    if (!c.contributors) c.contributors = {};
    c.contributors[player.name] = (c.contributors[player.name] ?? 0) + actual;
    setCagnottes(list);

    world.sendMessage(`§6[Cagnotte] §e${player.name} §6a contribué §e${fmtNC(actual)} §6à "§f${c.name}§6" !`);
    world.sendMessage(`§6Progression : §e${fmtNC(c.current)}§f/§e${fmtNC(c.target)}`);

    if (c.current >= c.target) {
      c.done = true;
      setCagnottes(list);
      world.sendMessage(`§6[Cagnotte] §a"${c.name}" §aatteinte ! §e${fmtNC(c.current)} §acollectés !`);
      await showCagnottesMenu(player);
    } else {
      await showCagnotteDetail(player, c);
    }
  });
}

// ── Item shop ─────────────────────────────────────────────────────────────────

async function showShopItem(player: Player, shopItem: ShopItem): Promise<void> {
  const bal    = getBalance(player);
  const name   = getItemLabel(shopItem);
  const canBuy = shopItem.buy > 0 && bal >= shopItem.buy;

  const buyLabel = shopItem.buy > 0
    ? (canBuy ? `§fPrix : §e${fmtNC(shopItem.buy)}` : `§fPrix : §e${fmtNC(shopItem.buy)}\n§cSolde insuffisant`)
    : "§fGratuit";

  const form = new ActionFormData()
    .title(`§6§l${name}§r${SHOP_ITEM_TAG}`)
    .body(`§e${fmtNC(bal)}`)
    .button(buyLabel, itemIconPath(shopItem.id))
    .button("§bRetour", "textures/ui/arrow_left");

  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection === 1) { system.run(async () => { await showShop(player); }); return; }

  system.run(() => {
    if (!canBuy || !removeBalance(player, shopItem.buy)) { player.sendMessage("§cSolde insuffisant."); return; }
    const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
    inv?.container?.addItem(new ItemStack(shopItem.id, shopItem.amount));
    player.sendMessage(`§aAchat de §f${name} ×${shopItem.amount} §apour §e${fmtNC(shopItem.buy)}§a.`);
  });
}

// ── Commandes ─────────────────────────────────────────────────────────────────

system.beforeEvents.startup.subscribe((ev) => {
  ev.customCommandRegistry.registerCommand(
    { name: "shuuaddons:shop", description: "Ouvre le shop.", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      system.run(async () => {
        const p = world.getAllPlayers().find((x) => x.id === origin.sourceEntity?.id);
        if (p) await showShop(p);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:addshopitem",
      description: "Ajoute ou modifie un item dans le shop.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "itemId",    type: CustomCommandParamType.String },
        { name: "categorie", type: CustomCommandParamType.String },
        { name: "achat",     type: CustomCommandParamType.Integer },
        { name: "vente",     type: CustomCommandParamType.Integer },
      ],
      optionalParameters: [{ name: "quantite", type: CustomCommandParamType.Integer }],
    },
    (origin, itemId: string, categorie: string, achat: number, vente: number, quantite?: number) => {
      system.run(() => {
        const items = getShopItems();
        const idx = items.findIndex((i) => i.id === itemId);
        const entry: ShopItem = { id: itemId, category: categorie, buy: achat, sell: vente, amount: quantite ?? 1 };
        if (idx >= 0) items[idx] = entry; else items.push(entry);
        setShopItems(items);
        world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id)
          ?.sendMessage(`§aShop mis à jour : §f${itemId}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:removeshopitem",
      description: "Retire un item du shop.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "itemId", type: CustomCommandParamType.String }],
    },
    (origin, itemId: string) => {
      system.run(() => {
        const items = getShopItems();
        setShopItems(items.filter((i) => i.id !== itemId));
        world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id)
          ?.sendMessage(`§aItem §f${itemId} §aretire.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:createcagnotte",
      description: "Crée une cagnotte globale.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "nom",      type: CustomCommandParamType.String },
        { name: "objectif", type: CustomCommandParamType.Integer },
        { name: "type",     type: CustomCommandParamType.String },
      ],
      optionalParameters: [{ name: "evenement", type: CustomCommandParamType.String }],
    },
    (origin, nom: string, objectif: number, type: string, evenement?: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        if (!["nether", "end", "event"].includes(type)) { admin?.sendMessage("§cType invalide. Utilisez : nether, end, event"); return; }
        const list = getCagnottes();
        if (list.find((c) => c.name === nom)) { admin?.sendMessage(`§cCagnotte "${nom}" existe déjà.`); return; }
        list.push({ id: `${Date.now()}`, name: nom, target: objectif, current: 0, type: type as "nether" | "end" | "event", eventName: evenement, done: false, contributors: {} });
        setCagnottes(list);
        world.sendMessage(`§6[Cagnotte] §eLancement de §f"${nom}" §e— Objectif : §f${fmtNC(objectif)}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:deletecagnotte",
      description: "Supprime une cagnotte.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "nom", type: CustomCommandParamType.String }],
    },
    (origin, nom: string) => {
      system.run(() => {
        const list = getCagnottes();
        setCagnottes(list.filter((c) => c.name !== nom));
        world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id)
          ?.sendMessage(`§aCagnotte "${nom}" supprimée.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});
