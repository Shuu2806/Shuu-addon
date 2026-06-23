import { Player, system } from "@minecraft/server";
import { ActionFormData, ActionFormResponse, FormCancelationReason } from "@minecraft/server-ui";

export async function showFormWithRetry(form: ActionFormData, player: Player): Promise<ActionFormResponse> {
  let response: ActionFormResponse;
  do {
    response = await form.show(player);
    if (response.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise<void>((resolve) => system.runTimeout(resolve, 5));
    }
  } while (response.cancelationReason === FormCancelationReason.UserBusy);
  return response;
}
