import { system, Player } from "@minecraft/server";
import { Panel, Screen, Image, render, useExit, useState, type JSX } from "@bedrock-core/ui";
import { useCloseOnHurt } from "../common/use-close-on-hurt.ts";
import { CenteredText } from "../common/centered-text.tsx";
import { Scaffold } from "../common/scaffold.tsx";
import { TitleBar, InfoBox, SaBtn, BG_BODY, BG_PANEL } from "../common/ui.tsx";
import { IconBtn, XpBarBtn, TwoColRow } from "../common/components.tsx";
import { fmtNC, getBalance, removeBalance } from "../common/economy.ts";
import {
  ALL_JOBS, JOB_META, JOB_ICONS, MATCH_FR,
  JOB_SLOT_COUNT, JOB_SLOT_COSTS,
  type JobKey,
} from "./constants.ts";
import {
  getJobData, setJobData, getJobEntry, xpForLevel,
  getEffectiveUpgrades, getSalaryAmount, getSalaryMinutes,
  getCustomRewardsMap, updateScoreboard, upsertTopPlayer, getTop3Players,
  type JobCategory,
} from "./helpers.ts";
import { JOBS_CONFIG, type ConfigEntry } from "./jobs_config.ts";

const W  = 280;
const WC = W - 8;

type View =
  | { kind: "menu" }
  | { kind: "detail"; job: JobKey }
  | { kind: "gains"; job: JobKey }
  | { kind: "add_job" }
  | { kind: "confirm_leave"; job: JobKey }
  | { kind: "confirm_slot" };

function fmtNcVal(nc: number): string {
  const t = Math.floor(nc * 100) / 100;
  return t % 1 === 0 ? `${t}` : t.toFixed(2);
}

export function showJobMenu(player: Player): void {
  render(function JobsForm() {
    const exit = useExit();
    useCloseOnHurt(player, exit);
    const [view, setView] = useState<View>({ kind: "menu" });

    const data          = getJobData(player);
    const bal           = getBalance(player);
    const nextSlotCost  = JOB_SLOT_COSTS[data.maxJobs + 1] ?? null;
    const medals        = ["§6§l1.", "§7§l2.", "§c§l3."];

    // ── Confirmation quitter ────────────────────────────────────────
    if (view.kind === "confirm_leave") {
      const job  = view.job;
      const meta = JOB_META[job];
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Retirer un métier" w={W} onClose={() => setView({ kind: "detail", job })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Retirer §e${meta.label}§r et perdre toute sa progression ?`} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cConfirmer" onPress={() => {
                          system.run(() => {
                            const d = getJobData(player);
                            d.active = d.active.filter(j => j !== job);
                            delete d.jobs[job];
                            setJobData(player, d);
                            updateScoreboard(player, job, 0);
                            upsertTopPlayer(player.name, job, 0);
                            player.sendMessage(`§aMétier §e${meta.label} §aretirée.`);
                          });
                          exit();
                        }} />,
                        <SaBtn label="Annuler" onPress={() => setView({ kind: "detail", job })} />,
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

    // ── Confirmation achat slot ─────────────────────────────────────
    if (view.kind === "confirm_slot") {
      const newMax   = data.maxJobs + 1;
      const cost     = JOB_SLOT_COSTS[newMax] ?? 0;
      const canAfford = bal >= cost;
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Acheter un slot" w={W} onClose={() => setView({ kind: "menu" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Slots après achat : §f${newMax}`} w={WC} />,
                    <InfoBox text={`Coût : §e${fmtNC(cost)}`} w={WC} />,
                    <InfoBox text={`Votre solde : §e${fmtNC(bal)}`} w={WC} />,
                    <InfoBox text={canAfford ? "§aVous pouvez acheter ce slot." : "§cSolde insuffisant."} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§aAcheter" onPress={() => {
                          if (!canAfford) return;
                          system.run(() => {
                            const d = getJobData(player);
                            if (!removeBalance(player, cost)) { player.sendMessage("§cSolde insuffisant."); return; }
                            d.maxJobs = newMax;
                            setJobData(player, d);
                            player.sendMessage(`§aSlot déverrouillé ! Vous pouvez maintenant avoir §e${newMax} §amétier(s).`);
                          });
                          exit();
                        }} />,
                        <SaBtn label="Annuler" onPress={() => setView({ kind: "menu" })} />,
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

    // ── Détail d'un métier ──────────────────────────────────────────
    if (view.kind === "detail") {
      const job    = view.job;
      const e      = getJobEntry(data, job);
      const meta   = JOB_META[job];
      const salary = getSalaryAmount(job, e.lvl);
      const freq   = getSalaryMinutes();
      const nextXp = xpForLevel(e.lvl + 1);
      const xpPct  = Math.min(100, Math.floor((e.xp / nextXp) * 100));
      const top3 = getTop3Players(job);

      let upgrades: { level: number; label: string; multiplier: number; match: string[] }[] = [];
      try { upgrades = getEffectiveUpgrades(job); } catch (_) { upgrades = []; }

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`${meta.label} — §eNiv.${e.lvl}`} w={W} onClose={exit} onBack={() => setView({ kind: "menu" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={6}>
                  {[
                    <CenteredText scale={0.5}>{`§fXP : §e${e.xp}§8/§e${nextXp}`}</CenteredText>,
                    <Image width={WC} height={10} texture={`textures/custom_ui/bars/pct_${xpPct}`} />,
                    <Panel width={WC} flexDirection="row" gap={2}>
                        {[
                          <Panel width={(2*WC)/3} background={BG_PANEL} flexDirection="column" padding={4} gap={2}>
                          {[
                            <CenteredText scale={0.5}>{"§eUpgrades"}</CenteredText>,
                            ...upgrades.flatMap(u => {
                              const col = e.lvl >= (u.level ?? 0) ? "§a" : "§7";
                              const match = u.match ?? [];
                              const mainLine = `${col}§lNV ${u.level ?? "?"} : §r${col}${u.label ?? "?"} x${u.multiplier ?? 1}`.slice(0, 65);
                              const out = [<CenteredText scale={0.5}>{mainLine}</CenteredText>];
                              if (match.length > 0) {
                                const matchTxt = `§7(${match.map((m: string) => MATCH_FR[m] ?? m).join(", ")})`.slice(0, 65);
                                out.push(<CenteredText scale={0.4}>{matchTxt}</CenteredText>);
                              }
                              return out;
                            }),
                            ...(upgrades.length === 0 ? [<CenteredText scale={0.5}>{"§7Aucun upgrade défini."}</CenteredText>] : []),
                          ] as unknown as JSX.Element}
                        </Panel>,
                        <InfoBox text={`§fSalaire §e${fmtNC(salary)}§f/${freq}min`} w={WC/3} />,
                      ]}
                    </Panel>,
                    
                    <Panel width={WC} background={BG_PANEL} flexDirection="column" padding={4} gap={2}>
                      {[
                        <CenteredText scale={0.5}>{"§eTop joueurs"}</CenteredText>,
                        ...[0, 1, 2].map(i => {
                          const p = top3[i];
                          const txt = p ? `${medals[i]} §r§f${p.name} §8- §eNiv.${p.lvl}` : `${medals[i]} §7Aucun joueur`;
                          return <CenteredText scale={0.5}>{txt}</CenteredText>;
                        }),
                      ] as unknown as JSX.Element}
                    </Panel>,
                    
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§eVoir les gains" onPress={() => setView({ kind: "gains", job })} />,
                        <SaBtn label="§c§lQuitter le job" onPress={() => setView({ kind: "confirm_leave", job })} />,
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

    // ── Gains ───────────────────────────────────────────────────────
    if (view.kind === "gains") {
      const job    = view.job;
      const meta   = JOB_META[job];
      const customs = getCustomRewardsMap()[job] ?? {};
      const jobCfg  = JOBS_CONFIG[job] ?? {};
      const catLabels: Record<JobCategory, string> = {
        casser: "Casser", cuire: "Cuire", pecher: "Pêcher", tuer: "Tuer",
      };

      const rows: JSX.Element[] = [];
      for (const cat of (["casser", "cuire", "pecher", "tuer"] as JobCategory[])) {
        const baseCat = (jobCfg[cat] ?? {}) as Record<string, ConfigEntry>;
        const lines: string[] = [];

        for (const [id, entry] of Object.entries(baseCat)) {
          if (id.startsWith("_")) continue;
          const ov = customs[id];
          if (ov?.category === cat && ov.xp === 0 && ov.nc === 0) continue;
          const eff = (ov?.category === cat) ? ov : entry;
          lines.push(`§f${entry.label} : §e${eff.xp} XP §8/ §6${fmtNcVal(eff.nc)} NC`);
        }
        for (const [id, r] of Object.entries(customs)) {
          if (r.category !== cat || (r.xp === 0 && r.nc === 0) || baseCat[id]) continue;
          lines.push(`§f${id.replace("minecraft:", "")} : §e${r.xp} XP §8/ §6${fmtNcVal(r.nc)} NC`);
        }
        if (job === "hunter" && cat === "tuer") {
          const fb = (baseCat as Record<string, { label: string; xp: number; nc: number }>)["_default"];
          if (fb) lines.push(`§7${fb.label} : §e${fb.xp} XP §8/ §6${fb.nc} NC`);
        }
        if (lines.length === 0) continue;

        rows.push(
          <Panel width={WC} background={BG_PANEL} flexDirection="column" padding={4} gap={2}>
            {[
              <CenteredText scale={0.5}>{`§e§l[${catLabels[cat]}]`}</CenteredText>,
              ...lines.map(l => <CenteredText scale={0.5}>{l}</CenteredText>),
            ] as unknown as JSX.Element}
          </Panel>
        );
      }

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Gains — ${meta.label}`} w={W} onClose={exit} onBack={() => setView({ kind: "detail", job })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    ...(rows.length > 0 ? rows : [<InfoBox text="Aucun gain défini." w={WC} />]),
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Ajouter un métier ───────────────────────────────────────────
    if (view.kind === "add_job") {
      const available = ALL_JOBS.filter(j => !data.active.includes(j));
      if (available.length === 0) {
        return (
          <Scaffold>
            {[
              <Panel width={W} flexDirection="column" gap={4}>
                {[
                  <TitleBar title="Ajouter un métier" w={W} onClose={exit} onBack={() => setView({ kind: "menu" })} />,
                  <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                    {[
                      <InfoBox text="Tous les métiers sont déjà actifs." w={WC} />,
                      <Panel width={WC} flexDirection="row" justifyContent="center">
                        {[<SaBtn label="Retour" onPress={() => setView({ kind: "menu" })} />] as unknown as JSX.Element}
                      </Panel>,
                    ] as unknown as JSX.Element}
                  </Panel>,
                ] as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Scaffold>
        );
      }

      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Ajouter un métier" w={W} onClose={exit} onBack={() => setView({ kind: "menu" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text="Sélectionnez le métier à ajouter :" w={WC} />,
                    ...(() => {
                      const addRows: JSX.Element[] = [];
                      const addBtnW = Math.floor(WC / 2) - 1;
                      const addBtns = available.map(job => {
                        const e    = getJobEntry(data, job);
                        const meta = JOB_META[job];
                        return (
                          <IconBtn
                            label={`${meta.color}§l${meta.label} §8Niv.§e${e.lvl}`}
                            icon={JOB_ICONS[job]}
                            width={addBtnW}
                            onPress={() => {
                              system.run(() => {
                                const d = getJobData(player);
                                if (d.active.length >= d.maxJobs) { player.sendMessage("§cPlus de slot disponible."); return; }
                                if (!d.active.includes(job)) d.active.push(job);
                                setJobData(player, d);
                                player.sendMessage(`§aMétier §e${meta.label} §aajouté !`);
                              });
                              exit();
                            }}
                          />
                        );
                      });
                      for (let i = 0; i < addBtns.length; i += 2) {
                        addRows.push(<TwoColRow width={WC}>{addBtns.slice(i, i + 2) as unknown as JSX.Element}</TwoColRow>);
                      }
                      return addRows;
                    })(),
                  ] as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    // ── Menu principal — grille 2 colonnes ─────────────────────────
    const btnW = Math.floor(WC / 2) - 1;
    const rows: JSX.Element[] = [];
    const allSlots: JSX.Element[] = [];

    for (let i = 0; i < JOB_SLOT_COUNT; i++) {
      if (i < data.active.length) {
        const job    = data.active[i];
        const e      = getJobEntry(data, job);
        const meta   = JOB_META[job];
        const nextXp = xpForLevel(e.lvl + 1);
        const xpPct  = Math.min(100, Math.floor((e.xp / nextXp) * 100));
        allSlots.push(
          <XpBarBtn
            label={`${meta.color}§l${meta.label} §8Niv.§e${e.lvl}`}
            icon={JOB_ICONS[job]}
            xpPct={xpPct}
            width={btnW}
            onPress={() => setView({ kind: "detail", job })}
          />
        );
      } else if (i < data.maxJobs) {
        allSlots.push(<IconBtn label="§fSlot libre §a§l+" icon="textures/items/diamond" width={btnW} onPress={() => setView({ kind: "add_job" })} />);
      } else if (i === data.maxJobs && nextSlotCost !== null) {
        allSlots.push(<IconBtn label={`§e§lDéverrouiller §f${fmtNC(nextSlotCost)}`} icon="textures/custom_ui/cadenas_open" width={btnW} onPress={() => setView({ kind: "confirm_slot" })} />);
      } else {
        allSlots.push(<IconBtn label="§7Slot verrouillé" icon="textures/custom_ui/cadenas_close" width={btnW} onPress={() => {}} />);
      }
    }

    for (let i = 0; i < allSlots.length; i += 2) {
      const pair = allSlots.slice(i, i + 2);
      rows.push(
        <TwoColRow width={WC}>
          {pair as unknown as JSX.Element}
        </TwoColRow>
      );
    }

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title="Métiers" w={W} onClose={exit} />,
              <InfoBox text={`Votre solde : §e${fmtNC(bal)}`} w={W} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                {rows as unknown as JSX.Element}
              </Panel>,
            ] as unknown as JSX.Element}
          </Panel>,
        ] as unknown as JSX.Element}
      </Scaffold>
    );
  }, player, Screen.Scroll);
}

export function showJobDetail(player: Player, job: JobKey): void {
  render(function JobDetailForm() {
    const exit = useExit();
    useCloseOnHurt(player, exit);
    const [view, setView] = useState<{ kind: "detail" } | { kind: "gains" } | { kind: "confirm_leave" }>({ kind: "detail" });
    const data   = getJobData(player);
    const e      = getJobEntry(data, job);
    const meta   = JOB_META[job];
    const salary = getSalaryAmount(job, e.lvl);
    const freq   = getSalaryMinutes();
    const nextXp = xpForLevel(e.lvl + 1);
    const xpPct  = Math.min(100, Math.floor((e.xp / nextXp) * 100));
    const upgrades = getEffectiveUpgrades(job);
    const medals   = ["§6§l1.", "§7§l2.", "§c§l3."];
    const top3     = getTop3Players(job);

    if (view.kind === "confirm_leave") {
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title="Retirer un métier" w={W} onClose={() => setView({ kind: "detail" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {[
                    <InfoBox text={`Retirer §e${meta.label}§r et perdre toute sa progression ?`} w={WC} />,
                    <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                      {[
                        <SaBtn label="§cConfirmer" onPress={() => {
                          system.run(() => {
                            const d = getJobData(player);
                            d.active = d.active.filter(j => j !== job);
                            delete d.jobs[job];
                            setJobData(player, d);
                            updateScoreboard(player, job, 0);
                            upsertTopPlayer(player.name, job, 0);
                            player.sendMessage(`§aMétier §e${meta.label} §aretirée.`);
                          });
                          exit();
                        }} />,
                        <SaBtn label="Annuler" onPress={() => setView({ kind: "detail" })} />,
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

    if (view.kind === "gains") {
      const customs  = getCustomRewardsMap()[job] ?? {};
      const jobCfg   = JOBS_CONFIG[job] ?? {};
      const catLabels: Record<JobCategory, string> = {
        casser: "Casser", cuire: "Cuire", pecher: "Pêcher", tuer: "Tuer",
      };
      const rows: JSX.Element[] = [];
      for (const cat of (["casser", "cuire", "pecher", "tuer"] as JobCategory[])) {
        const baseCat = (jobCfg[cat] ?? {}) as Record<string, ConfigEntry>;
        const lines: string[] = [];
        for (const [id, entry] of Object.entries(baseCat)) {
          if (id.startsWith("_")) continue;
          const ov = customs[id];
          if (ov?.category === cat && ov.xp === 0 && ov.nc === 0) continue;
          const eff = (ov?.category === cat) ? ov : entry;
          const t = Math.floor(eff.nc * 100) / 100;
          lines.push(`§f${entry.label} : §e${eff.xp} XP §8/ §6${t % 1 === 0 ? t : t.toFixed(2)} NC`);
        }
        for (const [id, r] of Object.entries(customs)) {
          if (r.category !== cat || (r.xp === 0 && r.nc === 0) || baseCat[id]) continue;
          const t = Math.floor(r.nc * 100) / 100;
          lines.push(`§f${id.replace("minecraft:", "")} : §e${r.xp} XP §8/ §6${t % 1 === 0 ? t : t.toFixed(2)} NC`);
        }
        if (job === "hunter" && cat === "tuer") {
          const fb = (baseCat as Record<string, { label: string; xp: number; nc: number }>)["_default"];
          if (fb) lines.push(`§7${fb.label} : §e${fb.xp} XP §8/ §6${fb.nc} NC`);
        }
        if (lines.length === 0) continue;
        rows.push(
          <Panel width={WC} background={BG_PANEL} flexDirection="column" padding={4} gap={2}>
            {[
              <CenteredText scale={0.5}>{`§e§l[${catLabels[cat]}]`}</CenteredText>,
              ...lines.map(l => <CenteredText scale={0.5}>{l}</CenteredText>),
            ] as unknown as JSX.Element}
          </Panel>
        );
      }
      return (
        <Scaffold>
          {[
            <Panel width={W} flexDirection="column" gap={4}>
              {[
                <TitleBar title={`Gains — ${meta.label}`} w={W} onClose={exit} onBack={() => setView({ kind: "detail" })} />,
                <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={4}>
                  {(rows.length > 0 ? rows : [<InfoBox text="Aucun gain défini." w={WC} />]) as unknown as JSX.Element}
                </Panel>,
              ] as unknown as JSX.Element}
            </Panel>,
          ] as unknown as JSX.Element}
        </Scaffold>
      );
    }

    return (
      <Scaffold>
        {[
          <Panel width={W} flexDirection="column" gap={4}>
            {[
              <TitleBar title={`${meta.label} — Niv.${e.lvl}`} w={W} onClose={exit} />,
              <Panel width={W} background={BG_BODY} flexDirection="column" padding={4} gap={6}>
                {[
                  <Panel width={WC} height={12} background={BG_PANEL} flexDirection="row" alignItems="center" paddingLeft={2} paddingRight={2}>
                    {[<Image width={WC - 4} height={10} texture={`textures/custom_ui/bars/pct_${xpPct}`} />] as unknown as JSX.Element}
                  </Panel>,
                  <InfoBox text={`Niv. §e${e.lvl} §8| §fXP §e${e.xp}§8/§e${nextXp} §8| §fSalaire §e${fmtNC(salary)}§f/${freq}min`} w={WC} />,
                  <Panel width={WC} background={BG_PANEL} flexDirection="column" padding={4} gap={2}>
                    {[
                      <CenteredText scale={0.5}>{"§eTop joueurs"}</CenteredText>,
                      ...[0, 1, 2].map(i => {
                        const p = top3[i];
                        const txt = p ? `${medals[i]} §r§f${p.name} §8- §eNiv.${p.lvl}` : `${medals[i]} §7Aucun joueur`;
                        return <CenteredText scale={0.5}>{txt}</CenteredText>;
                      }),
                    ] as unknown as JSX.Element}
                  </Panel>,
                  <Panel width={WC} background={BG_PANEL} flexDirection="column" padding={4} gap={2}>
                    {[
                      <CenteredText scale={0.5}>{"§eUpgrades"}</CenteredText>,
                      ...upgrades.map(u => {
                        const col = e.lvl >= (u.level ?? 0) ? "§a" : "§7";
                        const match = u.match ?? [];
                        const matchTxt = match.length > 0 ? ` (${match.map((m: string) => MATCH_FR[m] ?? m).join(", ")})` : "";
                        const txt = `${col}§lNV ${u.level ?? "?"} : §r${col}${u.label ?? "?"} x${u.multiplier ?? 1}${matchTxt}`;
                        return <CenteredText scale={0.5}>{txt}</CenteredText>;
                      }),
                      ...(upgrades.length === 0 ? [<CenteredText scale={0.5}>{"§7Aucun upgrade défini."}</CenteredText>] : []),
                    ] as unknown as JSX.Element}
                  </Panel>,
                  <Panel width={WC} flexDirection="row" gap={4} justifyContent="center">
                    {[
                      <SaBtn label="§eVoir les gains" onPress={() => setView({ kind: "gains" })} />,
                      <SaBtn label="§c§lQuitter le job" onPress={() => setView({ kind: "confirm_leave" })} />,
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
