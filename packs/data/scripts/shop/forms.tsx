import { world, system, Player, ItemStack, EntityComponentTypes, type EntityInventoryComponent } from "@minecraft/server";
import { Panel, Screen, Image, render, useExit, useState, type JSX } from "@bedrock-core/ui";
import { useCloseOnHurt } from "../common/use-close-on-hurt.ts";
import { Scaffold } from "../common/scaffold.tsx";
import { TitleBar, InfoBox, SaBtn, BG_BODY, BG_PANEL } from "../common/ui.tsx";
import { IconBtn, WideIconBtn, WideXpBtn, TwoColRow, StyledInput } from "../common/components.tsx";
import { getBalance, removeBalance, fmtNC } from "../common/economy.ts";
import { setJobBoost, addTopContributorBoosts } from "../jobs/helpers.ts";
import { setNetherBlocked, setEndBlocked } from "../common/dimensions.ts";
import { ALL_JOBS, JOB_META } from "../jobs/constants.ts";
import { getShopItems, getCagnottes, setCagnottes, getItemLabel, type ShopItem, type Cagnotte } from "./data.ts";

const W  = 280;
const WC = W - 8;

type View =
  | { kind: "shop" }
  | { kind: "item"; item: ShopItem }
  | { kind: "cag_list" }
  | { kind: "cag_detail"; cag: Cagnotte };

export function showShop(player: Player): void {
  render(function ShopForm() {
    const exit = useExit();
    useCloseOnHurt(player, exit);
    const [view, setView] = useState<View>({ kind: "shop" });
    const [contrib, setContrib] = useState("");

    const items        = getShopItems().filter(i => i.buy > 0);
    const allCagnottes = getCagnottes();
    const activeCags   = allCagnottes.filter(c => !c.done);
    const bal          = getBalance(player);

    // ── Détail item ──────────────────────────────────────────────────
    if (view.kind === "item") {
      const it     = view.item;
      const name   = getItemLabel(it);
      const canBuy = it.buy > 0 && bal >= it.buy;

      const buy = () => {
        system.run(() => {
          if (!canBuy || !removeBalance(player, it.buy)) { player.sendMessage("§cSolde insuffisant."); return; }
          const inv = player.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
          inv?.container?.addItem(new ItemStack(it.id, it.amount));
          player.sendMessage(`§aAchat de §f${name} ×${it.amount} §apour §e${fmtNC(it.buy)}§a.`);
        });
        exit();
      };

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={name} w={W} onClose={exit} onBack={() => setView({ kind: "shop" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Votre solde : §e${fmtNC(bal)}`} w={WC} />,
                    <InfoBox text={canBuy ? `Prix : §e${fmtNC(it.buy)}` : `§cPrix : §e${fmtNC(it.buy)} §c(solde insuffisant)`} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label={canBuy ? `§aAcheter ×${it.amount}` : "§7Solde insuffisant"} onPress={canBuy ? buy : () => {}} />,
                        <SaBtn label="Retour" onPress={() => setView({ kind: "shop" })} />,
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

    // ── Cagnottes — liste ────────────────────────────────────────────
    if (view.kind === "cag_list") {
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Cagnottes" w={W} onClose={exit} onBack={() => setView({ kind: "shop" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    activeCags.length === 0
                      ? <InfoBox text="Aucune cagnotte active." w={WC} />
                      : <InfoBox text={`${activeCags.length} objectif(s) communautaire(s) actif(s)`} w={WC} />,
                    ...activeCags.map(c => {
                      const pct = Math.min(100, Math.floor((c.current / c.target) * 100));
                      return (
                        <WideXpBtn
                          label={`§e${c.name} §7${fmtNC(c.current)}/${fmtNC(c.target)}`}
                          icon="textures/items/diamond"
                          xpPct={pct}
                          width={WC} height={48}
                          onPress={() => { setContrib(""); setView({ kind: "cag_detail", cag: c }); }}
                        />
                      );
                    }),
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Cagnotte — détail + contribution ──────────────────────────────
    if (view.kind === "cag_detail") {
      const c      = view.cag;
      const pct    = Math.min(100, Math.floor((c.current / c.target) * 100));
      const medals = ["§6§l1.", "§7§l2.", "§c§l3."];
      const top    = Object.entries(c.contributors ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const needed = c.target - c.current;

      const doContrib = () => {
        const montant = parseInt(contrib);
        if (isNaN(montant) || montant <= 0) { player.sendMessage("§cMontant invalide."); return; }
        if (bal < Math.min(montant, needed)) { player.sendMessage("§cSolde insuffisant."); return; }
        exit();
        system.run(() => {
          const list = getCagnottes();
          const live = list.find(x => x.id === c.id && !x.done);
          if (!live) { player.sendMessage("§cCagnotte introuvable ou déjà terminée."); return; }
          const actual = Math.min(montant, live.target - live.current);
          if (!removeBalance(player, actual)) { player.sendMessage("§cSolde insuffisant."); return; }
          live.current += actual;
          if (!live.contributors) live.contributors = {};
          live.contributors[player.name] = (live.contributors[player.name] ?? 0) + actual;
          if (live.current >= live.target) live.done = true;
          setCagnottes(list);
          world.sendMessage(`§6[Cagnotte] §e${player.name} §6a contribué §e${fmtNC(actual)} §6à "§f${live.name}§6" !`);
          if (live.done) {
            world.sendMessage(`§6[Cagnotte] §a"${live.name}" §aatteinte !`);
            if (live.type === "boost") {
              const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
              for (const job of ALL_JOBS) setJobBoost(job, 2, expiresAt);
              const jobNames = ALL_JOBS.map((j) => JOB_META[j].color + JOB_META[j].label).join("§r, ");
              world.sendMessage(`§d[Event Boost] §eTous les métiers (${jobNames}§e) sont boostés §d×2 §ependant §f24 heures §e!`);
            } else {
              addTopContributorBoosts(live.contributors);
              if (live.type === "nether") {
                setNetherBlocked(false);
                world.sendMessage(`§c[Nether] §aL'accès au Nether a été débloqué !`);
              } else if (live.type === "end") {
                setEndBlocked(false);
                world.sendMessage(`§d[End] §aL'accès à l'End a été débloqué !`);
              }
            }
          }
        });
      };

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={c.name} w={W} onClose={exit} onBack={() => setView({ kind: "cag_list" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <Image width={WC - 8} height={10} texture={`textures/custom_ui/bars/pct_${pct}`} />,
                    <InfoBox text={`${fmtNC(c.current)} / §e${fmtNC(c.target)} §7(${pct}%)`} w={WC} />,
                    ...top.map(([name, nc], i) => <InfoBox text={`${medals[i]} §r§f${name}  §e${fmtNC(nc)}`} w={WC} />),
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <StyledInput
                          width={WC} height={24} background={BG_PANEL}
                          label={`Montant en NC (Solde : ${fmtNC(bal)} | Restant : ${fmtNC(needed)})`}
                          placeholder="100"
                          value={contrib} onChange={setContrib}
                        />,
                        <SaBtn label="§a§lContribuer" onPress={doContrib} />,
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

    // ── Menu principal shop — grille 2 colonnes ──────────────────────
    const btnW = Math.floor(WC / 2) - 1;
    const shopBtns: JSX.Element[] = items.map(it => {
      const icon = `textures/items/${it.id.replace(/^[^:]+:/, "")}`;
      return (
        <IconBtn
          label={`§f${getItemLabel(it)}\n§e${fmtNC(it.buy)}`}
          icon={icon}
          width={btnW}
          onPress={() => setView({ kind: "item", item: it })}
        />
      );
    });
    const shopRows: JSX.Element[] = [];
    for (let i = 0; i < shopBtns.length; i += 2) {
      shopRows.push(<TwoColRow width={WC}>{shopBtns.slice(i, i + 2) as unknown as JSX.Element}</TwoColRow>);
    }

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Shop" w={W} onClose={exit} />,
              <InfoBox text={`Votre solde : §e${fmtNC(bal)}`} w={W} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {[
                  ...shopRows,
                  <WideIconBtn label={`§6§lCagnottes  §f${activeCags.length} active(s)`} icon="textures/items/diamond" width={WC}
                    onPress={() => setView({ kind: "cag_list" })} />,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}
