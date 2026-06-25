import {
  world, system, Player, ItemStack,
  ItemComponentTypes, EntityComponentTypes, EnchantmentTypes,
  type EntityInventoryComponent, type ItemEnchantableComponent,
  CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus,
} from "@minecraft/server";

const KITS_PROPERTY = "shuuaddons:kits";
const KIT_USAGE_KEY = "shuuaddons:kitused";

interface KitItem { id: string; count: number; name?: string; enc?: { id: string; lvl: number }[]; }
type KitData = Record<string, KitItem[]>;

function getKits(): KitData {
  const raw = world.getDynamicProperty(KITS_PROPERTY);
  return typeof raw === "string" ? (JSON.parse(raw) as KitData) : {};
}

function setKits(kits: KitData): void {
  world.setDynamicProperty(KITS_PROPERTY, JSON.stringify(kits));
}

function getUsedKits(player: Player): string[] {
  const raw = player.getDynamicProperty(KIT_USAGE_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as string[]) : [];
}

function markKitUsed(player: Player, kitName: string): void {
  const used = getUsedKits(player);
  if (!used.includes(kitName)) used.push(kitName);
  player.setDynamicProperty(KIT_USAGE_KEY, JSON.stringify(used));
}

function serializeItem(item: ItemStack): KitItem {
  const ki: KitItem = { id: item.typeId, count: item.amount };
  if (item.nameTag) ki.name = item.nameTag;
  try {
    const enc = item.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent;
    if (enc) {
      const list = enc.getEnchantments();
      if (list.length > 0) ki.enc = list.map(e => ({ id: e.type.id, lvl: e.level }));
    }
  } catch (_) {}
  return ki;
}

function deserializeItem(ki: KitItem): ItemStack {
  const stack = new ItemStack(ki.id, ki.count);
  if (ki.name) stack.nameTag = ki.name;
  if (ki.enc?.length) {
    try {
      const enc = stack.getComponent(ItemComponentTypes.Enchantable) as ItemEnchantableComponent;
      if (enc) {
        for (const e of ki.enc) {
          const type = EnchantmentTypes.get(e.id);
          if (type) enc.addEnchantment({ type, level: e.lvl });
        }
      }
    } catch (_) {}
  }
  return stack;
}

// Reset à la mort
world.afterEvents.entityDie.subscribe(event => {
  if (event.deadEntity.typeId !== "minecraft:player") return;
  (event.deadEntity as unknown as Player).setDynamicProperty(KIT_USAGE_KEY, "[]");
});

system.beforeEvents.startup.subscribe(ev => {

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:kit",
      description: "Utilise un kit (1 fois par vie).",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "nom", type: CustomCommandParamType.String }],
    },
    (origin, nom: string) => {
      system.run(() => {
        const player = world.getAllPlayers().find(p => p.id === origin.sourceEntity?.id);
        if (!player) return;
        const kit = getKits()[nom];
        if (!kit) { player.sendMessage(`§cLe kit "§e${nom}§c" n'existe pas.`); return; }
        if (getUsedKits(player).includes(nom)) { player.sendMessage(`§cVous avez déjà utilisé le kit "§e${nom}§c" cette vie.`); return; }
        const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
        if (!inv?.container) return;
        let skipped = 0;
        for (const ki of kit) {
          try { const left = inv.container.addItem(deserializeItem(ki)); if (left) skipped++; }
          catch (_) { skipped++; }
        }
        markKitUsed(player, nom);
        player.sendMessage(skipped > 0
          ? `§aKit "§e${nom}§a" utilisé ! §c${skipped} item(s) non donnés (inventaire plein).`
          : `§aKit "§e${nom}§a" utilisé !`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:createkit",
      description: "Crée un kit depuis votre inventaire actuel.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "nom", type: CustomCommandParamType.String }],
    },
    (origin, nom: string) => {
      system.run(() => {
        const player = world.getAllPlayers().find(p => p.id === origin.sourceEntity?.id);
        if (!player) return;
        const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
        if (!inv?.container) return;
        const items: KitItem[] = [];
        for (let i = 0; i < inv.container.size; i++) {
          const item = inv.container.getItem(i);
          if (item) items.push(serializeItem(item));
        }
        if (items.length === 0) { player.sendMessage("§cInventaire vide, kit non créé."); return; }
        const kits = getKits();
        kits[nom] = items;
        setKits(kits);
        player.sendMessage(`§aKit "§e${nom}§a" créé avec §e${items.length}§a item(s).`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  ev.customCommandRegistry.registerCommand(
    {
      name: "shuuaddons:deletekit",
      description: "Supprime un kit existant.",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: true,
      mandatoryParameters: [{ name: "nom", type: CustomCommandParamType.String }],
    },
    (origin, nom: string) => {
      system.run(() => {
        const player = world.getAllPlayers().find(p => p.id === origin.sourceEntity?.id);
        if (!player) return;
        const kits = getKits();
        if (!kits[nom]) { player.sendMessage(`§cLe kit "§e${nom}§c" n'existe pas.`); return; }
        delete kits[nom];
        setKits(kits);
        player.sendMessage(`§aKit "§e${nom}§a" supprimé.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );

});
