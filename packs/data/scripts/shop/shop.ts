import { world, system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { fmtNC } from "~/common/economy.ts";
import { getShopItems, setShopItems, getCagnottes, setCagnottes, type ShopItem, type Cagnotte } from "./data.ts";
import { showShop } from "./forms.tsx";

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

  ev.customCommandRegistry.registerEnum("shuuaddons:cagnottetype", ["nether", "end", "event", "boost"]);

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:createcagniotte",
      description: "Crée une cagnotte globale.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "shuuaddons:cagnottetype", type: CustomCommandParamType.Enum },
        { name: "nom",      type: CustomCommandParamType.String },
        { name: "objectif", type: CustomCommandParamType.Integer },
      ],
      optionalParameters: [{ name: "evenement", type: CustomCommandParamType.String }],
    },
    (origin, type: string, nom: string, objectif: number, evenement?: string) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const list = getCagnottes();
        if (list.find((c) => c.name === nom)) { admin?.sendMessage(`§cCagnotte "${nom}" existe déjà.`); return; }
        list.push({ id: `${Date.now()}`, name: nom, target: objectif, current: 0, type: type as Cagnotte["type"], eventName: evenement, done: false, contributors: {} });
        setCagnottes(list);
        world.sendMessage(`§6[Cagnotte] §eLancement de §f"${nom}" §e— Objectif : §f${fmtNC(objectif)}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:modifcagniotte",
      description: "Modifie l'objectif d'une cagnotte existante.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [
        { name: "nom",      type: CustomCommandParamType.String },
        { name: "objectif", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, nom: string, objectif: number) => {
      system.run(() => {
        const admin = world.getAllPlayers().find((p) => p.id === origin.sourceEntity?.id);
        const list = getCagnottes();
        const idx = list.findIndex((c) => c.name === nom);
        if (idx < 0) { admin?.sendMessage(`§cCagnotte "${nom}" introuvable.`); return; }
        list[idx].target = objectif;
        setCagnottes(list);
        admin?.sendMessage(`§aCagnotte "${nom}" mise à jour. Nouvel objectif : §e${fmtNC(objectif)}`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:deletecagniotte",
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
