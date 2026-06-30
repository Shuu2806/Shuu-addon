import { world, Player, EntityComponentTypes, ScoreboardIdentityType, type EntityInventoryComponent } from "@minecraft/server";
import { Panel, Screen, render, useEffect, useExit, useState, type JSX } from "@bedrock-core/ui";
import { Scaffold } from "../common/scaffold.tsx";
import { TitleBar, InfoBox, SaBtn, BG_BODY } from "../common/ui.tsx";
import { PaginatedList } from "../common/components.tsx";
import { REVIVE_ITEM, STARTING_LIVES } from "./constants.ts";
import { getLives, getLivesObjective, setLives, reviveFromSpectator, addPendingLives } from "./helpers.ts";

type DeadEntry = { online: true; player: Player } | { online: false; name: string };

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
  const obj = getLivesObjective();
  const onlineNames = new Set(world.getAllPlayers().map(p => p.name));
  const deadPlayers: DeadEntry[] = [
    ...world.getAllPlayers()
      .filter(p => getLives(p) <= 0)
      .map(p => ({ online: true as const, player: p })),
    ...obj.getParticipants()
      .filter(id => id.type === ScoreboardIdentityType.Player && !onlineNames.has(id.displayName) && (obj.getScore(id) ?? STARTING_LIVES) <= 0)
      .map(id => ({ online: false as const, name: id.displayName }))
  ];

  if (deadPlayers.length === 0) {
    player.sendMessage("§cAucun joueur n'a besoin d'être réanimé.");
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    render(function ReviveForm() {
      const exit = useExit();
      const [target, setTarget] = useState<DeadEntry | null>(null);

      useEffect(() => () => { resolve(); }, []);

      // ── Vue confirmation ──────────────────────────────────────────────
      if (target !== null) {
        const W = 220;
        const W_CONTENT = W - 8;
        const targetName = target.online ? target.player.name : target.name;

        const doRevive = () => {
          if (target.online) {
            if (!target.player.isValid) { player.sendMessage("§cCe joueur n'est plus disponible."); exit(); return; }
            const lives = getLives(target.player) + 1;
            setLives(target.player, lives);
            reviveFromSpectator(target.player);
            consumeReviveItem(player);
            target.player.sendMessage(`§aVous avez été réanimé par §e${player.name}§a ! Vous avez maintenant §c${lives}§a vie(s).`);
            player.sendMessage(`§aVous avez réanimé §e${target.player.name}§a !`);
          } else {
            addPendingLives(target.name, 1);
            consumeReviveItem(player);
            player.sendMessage(`§aVous avez réanimé §e${target.name}§a ! Il recevra sa vie à sa reconnexion.`);
          }
          exit();
        };

        return (
          <Scaffold>
            {[
              <Panel width={W} flexDirection="column">
                {[
                  <TitleBar title="Confirmation" w={W} onClose={exit} />,
                  <Panel width={W} height={4} />,
                  <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={6}>
                    {[
                      <InfoBox text={`Réanimer §e${targetName}§r${target.online ? "" : " §8(hors-ligne)"}§r ?`} w={W_CONTENT} />,
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
          </Scaffold>
        );
      }

      // ── Vue liste des joueurs ─────────────────────────────────────────
      const W = 240;
      const W_CONTENT = W - 8;

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column">
              {[
                <TitleBar title="Résurrection" w={W} onClose={exit} />,
                <Panel width={W} height={4} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text="Choisissez un joueur à ressusciter :" w={W_CONTENT} />,
                    <PaginatedList
                      width={W_CONTENT}
                      pageSize={8}
                      columns={2}
                      items={deadPlayers.map(dead => {
                        const colW = Math.floor((W_CONTENT - 2) / 2);
                        return (
                          <SaBtn
                            width={colW}
                            label={dead.online ? dead.player.name : `§7${dead.name}`}
                            onPress={() => setTarget(dead)}
                          />
                        );
                      })}
                    />,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }, player, Screen.Scroll);
  });
}
