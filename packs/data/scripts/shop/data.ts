import { world } from "@minecraft/server";
import { SHOP_CONFIG, type ShopConfigItem } from "./shop_config.ts";

export interface ShopItem {
  id: string;
  label?: string;
  category: string;
  buy: number;
  sell: number;
  amount: number;
}

export interface Cagnotte {
  id: string;
  name: string;
  target: number;
  current: number;
  type: "nether" | "end" | "event";
  eventName?: string;
  done: boolean;
  contributors: Record<string, number>;
}

const SHOP_KEY      = "shuuaddons:shop";
const CAGNOTTES_KEY = "shuuaddons:cagnottes";

export function getShopItems(): ShopItem[] {
  const raw = world.getDynamicProperty(SHOP_KEY);
  const overrides = typeof raw === "string" ? (JSON.parse(raw) as ShopItem[]) : [];
  const overrideMap = new Map(overrides.map(i => [i.id, i]));
  const base: ShopItem[] = (SHOP_CONFIG as ShopConfigItem[]).map(cfg => {
    if (!overrideMap.has(cfg.id)) return cfg;
    const ov = overrideMap.get(cfg.id)!;
    return { ...ov, label: ov.label ?? cfg.label };
  });
  const baseIds = new Set(base.map(i => i.id));
  return [...base, ...overrides.filter(i => !baseIds.has(i.id))];
}

export function setShopItems(items: ShopItem[]): void {
  const configMap = new Map((SHOP_CONFIG as ShopConfigItem[]).map(c => [c.id, c]));
  const toSave = items.filter(item => {
    const base = configMap.get(item.id);
    if (!base) return true;
    return base.buy !== item.buy || base.sell !== item.sell || base.amount !== item.amount || base.category !== item.category;
  });
  world.setDynamicProperty(SHOP_KEY, JSON.stringify(toSave));
}

export function getCagnottes(): Cagnotte[] {
  const raw = world.getDynamicProperty(CAGNOTTES_KEY);
  return typeof raw === "string" ? (JSON.parse(raw) as Cagnotte[]) : [];
}

export function setCagnottes(list: Cagnotte[]): void {
  world.setDynamicProperty(CAGNOTTES_KEY, JSON.stringify(list));
}

export function getItemLabel(item: ShopItem): string {
  if (item.label) return item.label;
  return item.id.replace(/^[^:]+:/, "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function itemIconPath(typeId: string): string {
  return "textures/items/" + typeId.replace(/^[^:]+:/, "");
}
