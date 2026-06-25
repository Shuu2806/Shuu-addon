import { world, Player, EntityComponentTypes, type EntityInventoryComponent } from "@minecraft/server";
import { Button, Panel, Screen, Text, render, useEffect, useExit, useState, type JSX } from "@bedrock-core/ui";
import { REVIVE_ITEM } from "./constants.ts";
import { getLives, setLives, reviveFromSpectator } from "./helpers.ts";

const BG_BODY   = "textures/custom_ui/custom_body_bg";
const BG_TITLE  = "textures/custom_ui/custom_title_bg";
const BG_PANEL  = "textures/custom_ui/custom_panel_bg";
const BTN       = "textures/custom_ui/button";
const BTN_HOV   = "textures/custom_ui/button_hover";
const CLOSE     = "textures/custom_ui/close_button";
const CLOSE_HOV = "textures/custom_ui/close_button_hover";

const BTN_W = 115;

// Minecraft adds 1px inter-glyph spacing (not counted in flex metrics).
// 7px/char (6 glyph + 1 spacing) × scale = actual rendered width.
function textW(text: string, scale: number): number {
  return Math.ceil(text.replace(/§./g, "").length * 7 * scale) + 2;
}

function TitleBar({ title, w, onClose }: { title: string; w: number; onClose: () => void }): JSX.Element {
  return (
    <Panel width={w} height={24} background={BG_TITLE} flexDirection="row" alignItems="center">
      <Panel flexGrow={1} height={24} flexDirection="row" justifyContent="center" alignItems="center">
        <Text font="mojangles" scale={1} minWidth={textW(title, 1)}>{`§f${title}`}</Text>
      </Panel>
      <Button
        width={12} height={12} marginRight={6}
        background={CLOSE} backgroundHover={CLOSE_HOV} backgroundPressed={CLOSE_HOV}
        alignSelf="center" onPress={onClose}
      >{""}</Button>
    </Panel>
  );
}

function InfoBox({ text, w }: { text: string; w: number }): JSX.Element {
  return (
    <Panel width={w} height={24} background={BG_PANEL} flexDirection="row" justifyContent="center" alignItems="center">
      <Text scale={0.5} minWidth={textW(text, 0.5)}>{`§7${text}`}</Text>
    </Panel>
  );
}

function SaBtn({ label, onPress }: { label: string; onPress: () => void }): JSX.Element {
  return (
    <Button
      width={BTN_W} height={24}
      background={BTN} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
      flexDirection="row" justifyContent="center" alignItems="center"
      onPress={onPress}
    >
      <Text scale={0.5} minWidth={textW(label, 0.5)}>{`§f${label}`}</Text>
    </Button>
  );
}

function consumeReviveItem(player: Player): void {
  const inventory = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
  const slot = player.selectedSlotIndex;
  const item = inventory.container?.getItem(slot);
  if (!item || item.typeId !== REVIVE_ITEM) return;
  if (item.amount > 1) {
    item.amount -= 1;
    inventory.container.setItem(slot, item);
  } else {
    inventory.container.setItem(slot, undefined);
  }
}

export function openReviveForm(player: Player): Promise<void> {
  const deadPlayers = world.getAllPlayers().filter((p) => getLives(p) <= 0);

  if (deadPlayers.length === 0) {
    player.sendMessage("§cAucun joueur n'a besoin d'être réanimé.");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    render(function ReviveForm() {
      const exit = useExit();
      const [target, setTarget] = useState<Player | null>(null);

      useEffect(() => () => { resolve(); }, []);

      // ── Vue confirmation ──────────────────────────────────────────────
      if (target !== null) {
        const W = 220;
        const W_CONTENT = W - 8;

        const doRevive = () => {
          if (!target.isValid) { player.sendMessage("§cCe joueur n'est plus disponible."); exit(); return; }
          const lives = getLives(target) + 1;
          setLives(target, lives);
          reviveFromSpectator(target);
          consumeReviveItem(player);
          target.sendMessage(`§aVous avez été réanimé par §e${player.name}§a ! Vous avez maintenant §c${lives}§a vie(s).`);
          player.sendMessage(`§aVous avez réanimé §e${target.name}§a !`);
          exit();
        };

        return (
          <Panel width={328} height={250} alignItems="center" justifyContent="center">
            {[
              <Panel width={W} flexDirection="column">
                {[
                  <TitleBar title="Confirmation" w={W} onClose={exit} />,
                  <Panel width={W} height={4} />,
                  <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={6}>
                    {[
                      <InfoBox text={`Réanimer §e${target.name}§r ?`} w={W_CONTENT} />,
                      <Panel width={W_CONTENT} height={24} flexDirection="row" gap={2} justifyContent="center" marginTop={2}>
                        {[
                          <SaBtn label="Confirmer" onPress={doRevive} />,
                          <SaBtn label="Annuler"   onPress={() => setTarget(null)} />,
                        ] as unknown as JSX.Element}
                      </Panel>,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>
        );
      }

      // ── Vue liste des joueurs ─────────────────────────────────────────
      const W = 240;
      const W_CONTENT = W - 8;

      return (
        <Panel width={328} height={250} alignItems="center" justifyContent="center">
          {[
            <Panel width={W} flexDirection="column">
              {[
                <TitleBar title="Résurrection" w={W} onClose={exit} />,
                <Panel width={W} height={4} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text="Choisissez un joueur à ressusciter :" w={W_CONTENT} />,
                    <Panel width={W_CONTENT} minHeight={56} flexDirection="row" wrap="wrap" gap={2} justifyContent="center" marginTop={4}>
                      {[
                        ...deadPlayers.map((dead) => (
                          <SaBtn label={dead.name} onPress={() => setTarget(dead)} />
                        )),
                      ] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Panel>
      );
    }, player, Screen.Scroll);
  });
}
