import { type Player } from "@minecraft/server";
import { Button, Panel, Screen, Text, render, useEffect, useExit } from "@bedrock-core/ui";
import { useCloseOnHurt } from "./use-close-on-hurt.ts";

export function showConfirmForm(
  player: Player,
  message: string,
  title = "Confirmation",
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    render(function ConfirmForm() {
      const exit = useExit();
      useCloseOnHurt(player, exit);

      useEffect(() => () => {
        if (!settled) { settled = true; resolve(false); }
      }, []);

      const confirm = () => { if (!settled) { settled = true; resolve(true);  exit(); } };
      const cancel  = () => { if (!settled) { settled = true; resolve(false); exit(); } };

      return (
        <Panel background="textures/ui/dialog_background_hollow_4" flexDirection="column" gap={8} padding={12}>
          <Text font="minecraftTen">{`§7§l${title}`}</Text>
          <Text>{message}</Text>
          <Button onPress={confirm}><Text>§aConfirmer</Text></Button>
          <Button onPress={cancel}><Text>§cAnnuler</Text></Button>
        </Panel>
      );
    }, player, Screen.Scroll);
  });
}
