export const JOBS_KEY = "shuuaddons:jobs";
export const MAX_LEVEL = 200;
export const JOB_SLOT_COUNT = 5;
export const JOB_SLOT_COSTS = [0, 0, 50_000, 250_000, 1_000_000, 2_500_000];

export const HIDDEN_BTN = "§0§0§0";

export type JobKey = "hunter" | "lumberjack" | "miner" | "fisher" | "farmer";

export const JOB_META: Record<JobKey, { label: string; color: string; scoreId: string }> = {
  hunter:     { label: "Chasseur",  color: "§c", scoreId: "shu_hunter"     },
  lumberjack: { label: "Bûcheron",  color: "§2", scoreId: "shu_lumberjack" },
  miner:      { label: "Mineur",    color: "§8", scoreId: "shu_miner"      },
  fisher:     { label: "Pêcheur",   color: "§b", scoreId: "shu_fisher"     },
  farmer:     { label: "Fermier",   color: "§a", scoreId: "shu_farmer"     },
};

export const ALL_JOBS = Object.keys(JOB_META) as JobKey[];

export const MATCH_FR: Record<string, string> = {
  witch: "Sorcière", phantom: "Fantôme", blaze: "Blaze",
  enderman: "Enderman", ghast: "Ghast",
  wither_skeleton: "Squelette Wither", piglin_brute: "Piglin Brutal",
  wither: "Wither", ender_dragon: "Ender Dragon",
  warden: "Warden", elder_guardian: "Elder Guardian",
  jungle: "Jungle", dark_oak: "Chêne Noir",
  mangrove: "Mangrove", cherry: "Cerisier",
  crimson: "Cramoisie", warped: "Déformée",
  deepslate: "Deepslate", nether_gold: "Or du Nether",
  nether_quartz: "Quartz du Nether", ancient_debris: "Ancient Debris",
  nautilus_shell: "Coquille Nautile", name_tag: "Étiquette",
  saddle: "Selle", enchanted_book: "Livre Enchanté",
  tropical_fish: "Poisson Tropical", pufferfish: "Poisson-Globe",
  glow_squid: "Calmar Luisant",
  wheat: "Blé", carrot: "Carotte", potato: "Pomme de terre",
  beetroot: "Betterave", nether_wart: "Verrue du Nether",
  pitcher_crop: "Plante Lanceur", torchflower: "Torchfleur",
};

export const JOB_ICONS: Record<JobKey, string> = {
  hunter:     "textures/items/bow_standby",
  lumberjack: "textures/items/stone_axe",
  miner:      "textures/items/stone_pickaxe",
  fisher:     "textures/items/fishing_rod_uncast",
  farmer:     "textures/items/stone_hoe",
};

export const JOB_FR: Record<string, JobKey> = {
  hunter: "hunter",
  bucheron: "lumberjack", lumberjack: "lumberjack",
  mineur: "miner", miner: "miner",
  pecheur: "fisher", fisher: "fisher",
  fermier: "farmer", farmer: "farmer",
};

export const JOB_FR_NAMES = "hunter, bucheron, mineur, pecheur, fermier";

export function resolveJob(name: string): JobKey | null {
  return JOB_FR[name.toLowerCase()] ?? null;
}

// Routing tags pour les panneaux UI custom
// Tous contiennent §1 pour que le fallback vanilla les détecte
export const JOBS_MENU_TAG   = "§3§1§a";
export const JOBS_DETAIL_TAG = "§3§1§b";
export const JOBS_GAINS_TAG  = "§3§1§c";
export const JOBS_LIST_TAG   = "§3§1§d";
