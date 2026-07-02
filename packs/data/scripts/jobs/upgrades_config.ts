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
      multiplier: 1.2,
      match: [] },
    { level: 50,  label: "Expert Chasseur",
      multiplier: 1.4,
      match: [] },
    { level: 100, label: "Légende du Chasseur",
      multiplier: 1.6,
      match: [] },
  ],

  lumberjack: [
    { level: 25,  label: "Bucheron Confirmé",
      multiplier: 1.2,
      match: [] },
    { level: 50,  label: "Expert Bucheron",
      multiplier: 1.4,
      match: [] },
    { level: 100, label: "Légende du Bucheron",
      multiplier: 1.6,
      match: [] },
  ],

  miner: [
    { level: 25,  label: "Mineur Confirmé",
      multiplier: 1.2,
      match: [] },
    { level: 50,  label: "Expert Mineur",
      multiplier: 1.4,
      match: [] },
    { level: 100, label: "Légende du Mineur",
      multiplier: 1.6,
      match: [] },
  ],

  fisher: [
    { level: 25,  label: "Pêcheur Confirmé",
      multiplier: 1.2,
      match: [] },
    { level: 50,  label: "Expert des Mers",
      multiplier: 1.4,
      match: [] },
    { level: 100, label: "Légende du Pêcheur",
      multiplier: 1.6,
      match: [] },
  ],

  farmer: [
    { level: 25,  label: "Agriculteur Confirmé",
      multiplier: 1.2,
      match: [] },
    { level: 50,  label: "Expert Agriculteur",
      multiplier: 1.4,
      match: [] },
    { level: 100, label: "Légende de l'Agriculteur",
      multiplier: 1.6,
      match: [] },
  ],

};
