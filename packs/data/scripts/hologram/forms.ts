import { system, Player } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { showFormWithRetry } from "~/common/form-utils.ts";
import { HOLOGRAM_TYPE, SEARCH_RADIUS, COLOR_CODES, COLOR_NAMES, COLOR_SLIDER_LABEL, padForm, getNearbyHolograms } from "./constants.ts";

export async function showHologramMenu(player: Player): Promise<void> {
  const form = new ActionFormData()
    .title("§b§lHologrammes")
    .body("§fQue souhaitez-vous faire ?")
    .button("§a§l+ Créer",           "textures/ui/confirm")
    .button("§c§lSupprimer",          "textures/ui/cancel")
    .button("§e§lModifier le texte",  "textures/ui/editIcon");

  padForm(form, 3);
  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) return;

  if (r.selection === 0)      system.run(async () => { await showCreateHologram(player); });
  else if (r.selection === 1) system.run(async () => { await showRemoveHologram(player); });
  else if (r.selection === 2) system.run(async () => { await showEditHologram(player); });
}

async function showCreateHologram(player: Player): Promise<void> {
  const r = await new ModalFormData()
    .title("§a§lCréer un hologramme")
    .textField("Texte  (\\n = retour à la ligne)", "Mon Hologramme")
    .slider(COLOR_SLIDER_LABEL, 0, COLOR_CODES.length - 1)
    .show(player);

  if (r.canceled || !r.formValues) return;
  const raw   = ((r.formValues[0] as string) ?? "").trim();
  const idx   = r.formValues[1] as number;
  if (!raw) { player.sendMessage("§cTexte vide."); return; }

  const code = COLOR_CODES[idx];
  const name = COLOR_NAMES[idx];
  player.sendMessage(`§7Couleur : ${code}${name}§r`);

  system.run(() => {
    const entity = player.dimension.spawnEntity(HOLOGRAM_TYPE, {
      x: player.location.x,
      y: player.location.y + 1.5,
      z: player.location.z,
    });
    entity.nameTag = (code + raw).replace(/\\n/g, "\n");
    player.sendMessage("§aHologramme créé !");
  });
}

async function showRemoveHologram(player: Player): Promise<void> {
  const holograms = getNearbyHolograms(player);
  if (holograms.length === 0) {
    player.sendMessage(`§7Aucun hologramme dans un rayon de ${SEARCH_RADIUS}m.`);
    return;
  }

  const form = new ActionFormData()
    .title("§c§lSupprimer un hologramme")
    .body(`§f${holograms.length} hologramme(s) à proximité :`);

  

  for (const h of holograms) {
    const dist = Math.round(Math.hypot(
      h.location.x - player.location.x,
      h.location.y - player.location.y,
      h.location.z - player.location.z
    ));
    form.button(`§f${h.nameTag.slice(0, 30).replace(/\n/g, " ↵ ")}\n§7${dist}m`, "textures/ui/cancel");
  }

  padForm(form, holograms.length);

  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) return;

  system.run(() => {
    const target = holograms[r.selection!];
    if (!target.isValid) { player.sendMessage("§cHologramme introuvable."); return; }
    target.remove();
    player.sendMessage("§aHologramme supprimé.");
  });
}

async function showEditHologram(player: Player): Promise<void> {
  const holograms = getNearbyHolograms(player);
  if (holograms.length === 0) {
    player.sendMessage(`§7Aucun hologramme dans un rayon de ${SEARCH_RADIUS}m.`);
    return;
  }

  const form = new ActionFormData()
    .title("§e§lModifier un hologramme")
    .body("§fChoisissez l'hologramme à modifier :");

  for (const h of holograms) {
    const dist = Math.round(Math.hypot(
      h.location.x - player.location.x,
      h.location.y - player.location.y,
      h.location.z - player.location.z
    ));
    form.button(`§f${h.nameTag.slice(0, 30).replace(/\n/g, " ↵ ")}\n§7${dist}m`, "textures/ui/editIcon");
  }

  padForm(form, holograms.length);

  const r = await showFormWithRetry(form, player);
  if (r.canceled || r.selection === undefined) return;

  const target = holograms[r.selection!];

  const r2 = await new ModalFormData()
    .title("§e§lModifier le texte")
    .textField("Nouveau texte  (\\n = retour à la ligne)", target.nameTag.replace(/\n/g, "\\n"))
    .slider(COLOR_SLIDER_LABEL, 0, COLOR_CODES.length - 1)
    .show(player);

  if (r2.canceled || !r2.formValues) return;
  const raw  = ((r2.formValues[0] as string) ?? "").trim();
  const idx2 = r2.formValues[1] as number;
  if (!raw) { player.sendMessage("§cTexte vide."); return; }

  system.run(() => {
    if (!target.isValid) { player.sendMessage("§cHologramme introuvable."); return; }
    target.nameTag = (COLOR_CODES[idx2] + raw).replace(/\\n/g, "\n");
    player.sendMessage("§aHologramme modifié !");
  });
}
