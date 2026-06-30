export interface ShopConfigItem {
  id: string;
  label?: string;
  category: string;
  buy: number;
  sell: number;
  amount: number;
}

export const SHOP_CONFIG: ShopConfigItem[] = [
  { id: "shuuaddons:claim_tool", label: "Outil de Claim",    category: "Outils", buy:     5_000, sell: 0, amount: 1 },
  { id: "shuuaddons:shop_chest", label: "Item Shop",          category: "Outils", buy:    10_000, sell: 0, amount: 1 },
  { id: "shuuaddons:extra_life", label: "Vie Supplémentaire", category: "Vie",    buy:  750_000, sell: 0, amount: 1 },
  { id: "shuuaddons:revive",     label: "Revive",             category: "Vie",    buy: 1_500_000, sell: 0, amount: 1 },
];
