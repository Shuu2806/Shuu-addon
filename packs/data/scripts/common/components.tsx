import { Button, Panel, Image, Input, Slider, Dropdown, useState, type JSX } from "@bedrock-core/ui";
import type { InputProps, SliderProps, DropdownProps } from "@bedrock-core/ui";
import { BTN, BTN_HOV, BG_PANEL } from "./ui.tsx";
import { CenteredText } from "./centered-text.tsx";

// ── IconBtn — icône en haut (22×22) + label en bas ────────────────────────────
export function IconBtn({
  label, icon, onPress,
  width = 132, height = 44, iconSize = 22,
}: {
  label: string; icon: string; onPress: () => void;
  width?: number; height?: number; iconSize?: number;
}): JSX.Element {
  return (
    <Button
      width={width} height={height}
      background={BTN} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
      flexDirection="column" alignItems="center" justifyContent="center" gap={2} padding={4}
      onPress={onPress}
    >
      {[
        <Image width={iconSize} height={iconSize} texture={icon} />,
        <CenteredText scale={0.5}>{label}</CenteredText>,
      ] as unknown as JSX.Element}
    </Button>
  );
}

// ── WideIconBtn — icône absolue à gauche + label vraiment centré ─────────────
export function WideIconBtn({
  label, icon, onPress,
  width = 264, height = 36,
}: {
  label: string; icon: string; onPress: () => void;
  width?: number; height?: number;
}): JSX.Element {
  return (
    <Button
      width={width} height={height}
      background={BTN} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
      flexDirection="row" alignItems="center" justifyContent="center"
      onPress={onPress}
    >
      {[
        <Image width={22} height={22} texture={icon} position="absolute" left={8} top={(height - 22) / 2} />,
        <CenteredText scale={0.5}>{label}</CenteredText>,
      ] as unknown as JSX.Element}
    </Button>
  );
}

// ── WideXpBtn — bouton large : icône en haut + label + barre XP en bas ────────
export function WideXpBtn({
  label, icon, xpPct, onPress,
  width = 264, height = 48, iconSize = 22,
}: {
  label: string; icon: string; xpPct: number; onPress: () => void;
  width?: number; height?: number; iconSize?: number;
}): JSX.Element {
  const barW = width - 16;
  return (
    <Button
      width={width} height={height}
      background={BTN} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
      flexDirection="column" alignItems="center" justifyContent="space-between" padding={4} gap={2}
      onPress={onPress}
    >
      {[
        <Image width={iconSize} height={iconSize} texture={icon} />,
        <CenteredText scale={0.5}>{label}</CenteredText>,
        <Image width={barW} height={6} texture={`textures/custom_ui/bars/pct_${Math.min(100, Math.max(0, Math.floor(xpPct)))}`} />,
      ] as unknown as JSX.Element}
    </Button>
  );
}

// ── XpBarBtn — slot métier : icône + label + barre XP en bas ──────────────────
export function XpBarBtn({
  label, icon, xpPct, onPress,
  width = 132, height = 48,
}: {
  label: string; icon: string; xpPct: number; onPress: () => void;
  width?: number; height?: number;
}): JSX.Element {
  const barW = width - 16;
  return (
    <Button
      width={width} height={height}
      background={BTN} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
      flexDirection="column" alignItems="center" justifyContent="space-between" padding={4}
      onPress={onPress}
    >
      {[
        <Image width={20} height={20} texture={icon} />,
        <CenteredText scale={0.5}>{label}</CenteredText>,
        <Image width={barW} height={6} texture={`textures/custom_ui/bars/pct_${Math.min(100, Math.max(0, xpPct))}`} />,
      ] as unknown as JSX.Element}
    </Button>
  );
}

// ── ProgressBar — barre de progression (Image) ────────────────────────────────
export function ProgressBar({ pct, width, height = 8 }: { pct: number; width: number; height?: number }): JSX.Element {
  return (
    <Image
      width={width} height={height}
      texture={`textures/custom_ui/bars/pct_${Math.min(100, Math.max(0, Math.floor(pct)))}`}
    />
  );
}

// ── TwoColRow — ligne 2 boutons côte à côte ───────────────────────────────────
export function TwoColRow({
  children, width, height,
}: {
  children: JSX.Node; width: number; height?: number;
}): JSX.Element {
  return (
    <Panel width={width} height={height} flexDirection="row" gap={2}>
      {children}
    </Panel>
  );
}

// ── ActionReturnRow — ligne action (65%) + retour (35%) ───────────────────────
export function ActionReturnRow({
  actionLabel, actionIcon, onAction,
  returnLabel, returnIcon, onReturn,
  width, height = 36,
}: {
  actionLabel: string; actionIcon: string; onAction: () => void;
  returnLabel: string; returnIcon: string; onReturn: () => void;
  width: number; height?: number;
}): JSX.Element {
  const aW = Math.floor(width * 0.65) - 1;
  const rW = width - aW - 2;
  return (
    <Panel width={width} height={height} flexDirection="row" gap={2}>
      {[
        <WideIconBtn label={actionLabel} icon={actionIcon} onPress={onAction} width={aW} height={height} />,
        <WideIconBtn label={returnLabel} icon={returnIcon} onPress={onReturn} width={rW} height={height} />,
      ] as unknown as JSX.Element}
    </Panel>
  );
}

// ── Inputs centrés ────────────────────────────────────────────────────────────

export function StyledInput(props: InputProps): JSX.Element {
  return (
    <Input
      height={24} background={BG_PANEL}
      flexDirection="row" justifyContent="center" alignItems="center"
      {...props}
    />
  );
}

export function StyledSlider(props: SliderProps): JSX.Element {
  return (
    <Slider
      height={24} background={BG_PANEL}
      flexDirection="row" justifyContent="center" alignItems="center"
      {...props}
    />
  );
}

export function StyledDropdown(props: DropdownProps): JSX.Element {
  return (
    <Dropdown
      height={24} background={BG_PANEL}
      flexDirection="row" justifyContent="center" alignItems="center"
      {...props}
    />
  );
}

// ── PaginatedList — liste paginée avec nav distincte ──────────────────────────
export function PaginatedList({
  items, width, pageSize = 6, columns = 1,
}: {
  items: JSX.Element[]; width: number; pageSize?: number; columns?: number;
}): JSX.Element {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current    = Math.min(page, totalPages - 1);
  const rawItems   = items.slice(current * pageSize, (current + 1) * pageSize);

  const pageItems: JSX.Element[] = columns > 1
    ? (() => {
        const rows: JSX.Element[] = [];
        for (let i = 0; i < rawItems.length; i += columns) {
          rows.push(
            <Panel width={width} flexDirection="row" gap={2}>
              {rawItems.slice(i, i + columns) as unknown as JSX.Element}
            </Panel>
          );
        }
        return rows;
      })()
    : rawItems;
  const showNav    = totalPages > 1;
  const navBtnW    = Math.floor(width * 0.38);
  const pageInfoW  = width - navBtnW * 2 - 4;

  return (
    <Panel width={width} flexDirection="column" gap={2} paddingTop={4} paddingBottom={4}>
      {[
        ...pageItems,
        ...(showNav ? [(
          <Panel width={width} height={20} flexDirection="row" gap={2} marginTop={4}>
            {[
              <Button
                width={navBtnW} height={20}
                background={BG_PANEL} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
                flexDirection="row" justifyContent="center" alignItems="center"
                enabled={current > 0}
                onPress={() => setPage(current - 1)}
              >
                {[<CenteredText scale={0.5}>{current > 0 ? "§e◀ §7Précédent" : "§8◀ Précédent"}</CenteredText>] as unknown as JSX.Element}
              </Button>,
              <Panel width={pageInfoW} height={20} background={BG_PANEL} flexDirection="row" justifyContent="center" alignItems="center">
                {[<CenteredText scale={0.5}>{`§7${current + 1} §8/ §7${totalPages}`}</CenteredText>] as unknown as JSX.Element}
              </Panel>,
              <Button
                width={navBtnW} height={20}
                background={BG_PANEL} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
                flexDirection="row" justifyContent="center" alignItems="center"
                enabled={current < totalPages - 1}
                onPress={() => setPage(current + 1)}
              >
                {[<CenteredText scale={0.5}>{current < totalPages - 1 ? "§7Suivant §e▶" : "§8Suivant ▶"}</CenteredText>] as unknown as JSX.Element}
              </Button>,
            ] as unknown as JSX.Element}
          </Panel>
        )] : []),
      ] as unknown as JSX.Element}
    </Panel>
  );
}
