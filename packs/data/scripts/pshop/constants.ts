export const SHOP_BLOCK     = "shuuaddons:shop_chest";
export const DISPLAY_ENTITY = "shuuaddons:shop_display";
export const MAX_STOCK      = 10_000;
export const DEFAULT_NAME   = "Vendre des items";

export const P_PLACED_BY  = "placedBy";
export const P_ITEM       = "itemForSale";
export const P_AMOUNT     = "amountForSale";
export const P_PRICE      = "price";
export const P_SELLER     = "sellerName";
export const P_SHOP_NAME  = "shopName";
export const P_ITEM_DATA  = "itemData";

export const rewardsKey = (name: string) => `shuuaddons:rewards_${name}`;

const HIDDEN_BTN   = "§0§0§0";
const VANILLA_SLOTS = 10;

export function padForm(form: import("@minecraft/server-ui").ActionFormData, count: number): void {
  for (let i = count; i < VANILLA_SLOTS; i++) form.button(HIDDEN_BTN, "");
}

export function formatItemName(typeId: string): string {
  return typeId.replace(/^[^:]+:/, "").replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function buildNameTag(shopName: string, itemName: string, stock: number, price: number): string {
  return `§e${shopName}\n§a${itemName} (${stock})\n§6Prix : ${price.toLocaleString()} NC`;
}

export function getItemName(itemDataStr: string | undefined, typeId: string): string {
  if (itemDataStr) {
    try { const d = JSON.parse(itemDataStr); if (d.nameTag) return d.nameTag; } catch {}
  }
  return formatItemName(typeId);
}
