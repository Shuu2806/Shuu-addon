export interface UpgradeEntry {
  level: number;
  label: string;
  multiplier: number;
  match: string[];
}

export type UpgradesConfig = Record<string, UpgradeEntry[]>;

export const UPGRADES_CONFIG: UpgradesConfig = {

  hunter: [
    { level: 25,  label: "Chasseur Confirmé",
      multiplier: 1.5,
      match: ["witch", "phantom", "blaze", "enderman", "ghast", "wither_skeleton", "piglin_brute"] },
    { level: 50,  label: "Tueur de Boss",
      multiplier: 2.0,
      match: ["wither", "ender_dragon", "warden", "elder_guardian"] },
    { level: 100, label: "Grand Chasseur",
      multiplier: 1.5,
      match: [] },
  ],

  lumberjack: [
    { level: 25,  label: "Bucheron Avancé",
      multiplier: 1.5,
      match: ["jungle", "dark_oak", "mangrove", "cherry"] },
    { level: 50,  label: "Maître Forestier",
      multiplier: 2.0,
      match: ["crimson", "warped"] },
    { level: 100, label: "Légende du Bois",
      multiplier: 1.5,
      match: [] },
  ],

  miner: [
    { level: 25,  label: "Mineur Deepslate",
      multiplier: 2.0,
      match: ["deepslate"] },
    { level: 50,  label: "Expert Nether",
      multiplier: 2.0,
      match: ["nether_gold", "nether_quartz", "ancient_debris"] },
    { level: 100, label: "Excavateur Légendaire",
      multiplier: 1.5,
      match: [] },
  ],

  fisher: [
    { level: 25,  label: "Chasseur de Trésors",
      multiplier: 1.5,
      match: ["nautilus_shell", "name_tag", "saddle", "enchanted_book"] },
    { level: 50,  label: "Expert des Mers",
      multiplier: 1.5,
      match: ["tropical_fish", "pufferfish", "glow_squid"] },
    { level: 100, label: "Maître Pêcheur",
      multiplier: 1.5,
      match: [] },
  ],

  farmer: [
    { level: 25,  label: "Maître des Cultures",
      multiplier: 1.5,
      match: ["wheat", "carrot", "potato", "beetroot"] },
    { level: 50,  label: "Agriculteur Prodige",
      multiplier: 2.0,
      match: ["nether_wart", "pitcher_crop", "torchflower"] },
    { level: 100, label: "Légende des Champs",
      multiplier: 1.5,
      match: [] },
  ],

};
