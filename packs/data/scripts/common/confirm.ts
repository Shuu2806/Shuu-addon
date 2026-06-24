import { Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { showFormWithRetry } from "./form-utils.ts";

const CONFIRM_TAG = "§5§1";

export async function showConfirmForm(
  player: Player,
  message: string,
  title = "Confirmation"
): Promise<boolean> {
  const sizeTag = title.length > 12 ? "§e§f" : "";
  const form = new ActionFormData()
    .title(`${sizeTag}§7§l${title}§r${CONFIRM_TAG}`)
    .body(message)
    .button("§aConfirmer")
    .button("§cAnnuler");

  const response = await showFormWithRetry(form, player);
  if (response.canceled || response.selection === undefined) return false;
  return response.selection === 0;
}
