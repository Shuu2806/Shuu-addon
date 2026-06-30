import { system, Player, Entity } from "@minecraft/server";
import { Panel, Screen, Text, render, useExit, useState, type JSX } from "@bedrock-core/ui";
import { Scaffold } from "../common/scaffold.tsx";
import { TitleBar, InfoBox, SaBtn, BG_BODY, BG_PANEL } from "../common/ui.tsx";
import { WideIconBtn, StyledInput, StyledSlider } from "../common/components.tsx";
import { HOLOGRAM_TYPE, COLOR_CODES, COLOR_NAMES, COLOR_SLIDER_LABEL, getNearbyHolograms } from "./constants.ts";

type View = "menu" | "create" | "remove" | "edit_pick" | { kind: "editing"; target: Entity };

const W = 240;
const W_CONTENT = W - 8;

export function showHologramMenu(player: Player): void {
  render(function HologramForm() {
    const exit = useExit();
    const [view, setView]         = useState<View>("menu");
    const [holoText, setHoloText] = useState("");
    const [colorIdx, setColorIdx] = useState(15);

    const holograms = getNearbyHolograms(player);

    // ── Créer / Modifier ─────────────────────────────────────────────
    if (view === "create" || (typeof view === "object" && view.kind === "editing")) {
      const isEdit  = typeof view === "object";
      const target  = isEdit ? view.target : null;
      const title   = isEdit ? "Modifier le texte" : "Créer un hologramme";
      const colorPreview = `${COLOR_CODES[colorIdx]}${COLOR_NAMES[colorIdx]}§r`;

      const confirm = () => {
        if (!holoText.trim()) { player.sendMessage("§cTexte vide."); return; }
        const finalText = (COLOR_CODES[colorIdx] + holoText).replace(/\\n/g, "\n");
        system.run(() => {
          if (isEdit) {
            if (!target!.isValid) { player.sendMessage("§cHologramme introuvable."); return; }
            target!.nameTag = finalText;
            player.sendMessage("§aHologramme modifié !");
          } else {
            const entity = player.dimension.spawnEntity(HOLOGRAM_TYPE, {
              x: player.location.x, y: player.location.y + 1.5, z: player.location.z,
            });
            entity.nameTag = finalText;
            player.sendMessage("§aHologramme créé !");
          }
        });
        exit();
      };

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={title} w={W} onClose={exit} onBack={() => setView("menu")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <StyledInput
                      width={W_CONTENT} height={24} background={BG_PANEL}
                      label="Texte (\\n = retour à la ligne)" placeholder="Mon Hologramme"
                      value={holoText} onChange={setHoloText}
                    />,
                    <InfoBox text={`Couleur : ${colorPreview}`} w={W_CONTENT} />,
                    <StyledSlider
                      width={W_CONTENT} height={24} background={BG_PANEL}
                      label={COLOR_SLIDER_LABEL}
                      min={0} max={COLOR_CODES.length - 1}
                      value={colorIdx} onChange={setColorIdx}
                      face={<Text scale={0.5}>{colorPreview}</Text>}
                    />,
                    <Panel width={W_CONTENT} height={24} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label={isEdit ? "Modifier" : "Créer"} onPress={confirm} />,
                        <SaBtn label="Retour" onPress={() => setView("menu")} />,
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

    // ── Liste des hologrammes (supprimer / éditer) ────────────────────
    if (view === "remove" || view === "edit_pick") {
      const isRemove = view === "remove";
      const title = isRemove ? "Supprimer un hologramme" : "Choisir un hologramme";

      const listContent = holograms.length === 0
        ? [<InfoBox text="Aucun hologramme à proximité." w={W_CONTENT} />]
        : holograms.map(h => {
          const dist = Math.round(Math.hypot(
            h.location.x - player.location.x,
            h.location.y - player.location.y,
            h.location.z - player.location.z,
          ));
          const label = `${h.nameTag.slice(0, 22).replace(/\n/g, " ↵")} §7${dist}m`;
          const onPress = isRemove
            ? () => { system.run(() => { if (h.isValid) { h.remove(); player.sendMessage("§aHologramme supprimé."); } }); exit(); }
            : () => {
              const tag   = h.nameTag;
              const cIdx  = COLOR_CODES.findIndex(c => tag.startsWith(c));
              setColorIdx(cIdx >= 0 ? cIdx : 15);
              setHoloText(cIdx >= 0 ? tag.slice(2).replace(/\n/g, "\\n") : tag.replace(/\n/g, "\\n"));
              setView({ kind: "editing", target: h });
            };
          return <SaBtn label={label} onPress={onPress} width={W_CONTENT} />;
        });

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={title} w={W} onClose={exit} onBack={() => setView("menu")} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    ...listContent,
                    <Panel width={W_CONTENT} flexDirection="row" justifyContent="center">
                      {[<SaBtn label="Retour" onPress={() => setView("menu")} />] as unknown as JSX.Element}
                    </Panel>,
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Menu principal ────────────────────────────────────────────────
    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Hologrammes" w={W} onClose={exit} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {[
                  <InfoBox text="Que souhaitez-vous faire ?" w={W_CONTENT} />,
                  <Panel width={W_CONTENT} flexDirection="column" gap={4} marginTop={4}>
                    {[
                      <WideIconBtn label="§a+ Créer" icon="textures/ui/confirm" width={W_CONTENT} onPress={() => { setHoloText(""); setColorIdx(15); setView("create"); }} />,
                      <WideIconBtn label="§cSupprimer" icon="textures/ui/cancel" width={W_CONTENT} onPress={() => setView("remove")} />,
                      <WideIconBtn label="§eModifier le texte" icon="textures/ui/editIcon" width={W_CONTENT} onPress={() => setView("edit_pick")} />,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}
