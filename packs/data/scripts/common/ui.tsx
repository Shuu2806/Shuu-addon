import { Button, Panel, Text, type JSX } from "@bedrock-core/ui";
import { CenteredText } from "./centered-text.tsx";

export const BG_BODY  = "textures/custom_ui/custom_body_bg";
export const BG_TITLE = "textures/custom_ui/custom_title_bg";
export const BG_PANEL = "textures/custom_ui/custom_panel_bg";
export const BTN      = "textures/custom_ui/button";
export const BTN_HOV  = "textures/custom_ui/button_hover";
export const CLOSE    = "textures/custom_ui/close_button";
export const CLOSE_HOV = "textures/custom_ui/close_button_hover";
export const RETURN     = "textures/custom_ui/return_button";
export const RETURN_HOV = "textures/custom_ui/return_button_hover";


export function TitleBar({ title, w, onClose, onBack }: { title: string; w: number; onClose: () => void; onBack?: () => void }): JSX.Element {
  return (
    <Panel width={w} height={24} background={BG_TITLE} flexDirection="row" alignItems="center">
      {[
        <CenteredText font="mojangles" scale={1} flexGrow={1}>{`§f${title}`}</CenteredText>,
        onBack && (
          <Button
            position="absolute" right={20} top={6}
            width={12} height={12}
            background={RETURN} backgroundHover={RETURN_HOV} backgroundPressed={RETURN_HOV}
            onPress={onBack}
          >{""}</Button>
        ),
        <Button
          position="absolute" right={6} top={6}
          width={12} height={12}
          background={CLOSE} backgroundHover={CLOSE_HOV} backgroundPressed={CLOSE_HOV}
          onPress={onClose}
        >{""}</Button>,
      ].filter(Boolean) as unknown as JSX.Element}
    </Panel>
  );
}

export function InfoBox({ text, w }: { text: string; w: number }): JSX.Element {
  return (
    <Panel width={w} minHeight={24} background={BG_PANEL} flexDirection="row" alignItems="center">
      <CenteredText scale={0.5}>{`§7${text}`}</CenteredText>
    </Panel>
  );
}

export function SaBtn({ label, onPress, width = 115 }: { label: string; onPress: () => void; width?: number }): JSX.Element {
  return (
    <Button
      width={width} height={24}
      background={BTN} backgroundHover={BTN_HOV} backgroundPressed={BTN_HOV}
      flexDirection="row" justifyContent="center" alignItems="center"
      onPress={onPress}
    >
      <Text scale={0.5}>{`§f${label}`}</Text>
    </Button>
  );
}
