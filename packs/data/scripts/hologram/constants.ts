import { Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

export const HOLOGRAM_TYPE  = "shuuaddons:hologram";
export const SEARCH_RADIUS  = 20;
export const HIDDEN_BTN     = "§0§0§0";
export const VANILLA_SLOTS  = 10;

export const COLOR_SLIDER_LABEL = (() => {
  const names = [
    "Noir","Bleu foncé","Vert foncé","Sarcelle","Rouge foncé","Violet","Or","Gris clair",
    "Gris","Bleu","Vert","Cyan","Rouge","Magenta","Jaune","Blanc",
  ];
  return "Couleur\n" + names.map((n, i) => `${i}=${n}`).join("  ");
})();

export const COLOR_CODES = [
  "§0","§1","§2","§3","§4","§5","§6","§7",
  "§8","§9","§a","§b","§c","§d","§e","§f",
];
export const COLOR_NAMES = [
  "Noir","Bleu foncé","Vert foncé","Sarcelle","Rouge foncé","Violet","Or","Gris clair",
  "Gris","Bleu","Vert","Cyan","Rouge","Magenta","Jaune","Blanc",
];

export function padForm(form: ActionFormData, count: number): void {
  for (let i = count; i < VANILLA_SLOTS; i++) form.button(HIDDEN_BTN, "");
}

export function getNearbyHolograms(player: Player) {
  return player.dimension.getEntities({
    type: HOLOGRAM_TYPE,
    maxDistance: SEARCH_RADIUS,
    location: player.location,
  });
}
