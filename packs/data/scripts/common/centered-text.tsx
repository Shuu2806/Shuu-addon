import { withControl, type ControlProps, type TextFont, type JSX } from "@bedrock-core/ui";

const FONT_TYPE_MAP: Record<string, string> = {
  mojangles: "default",
  minecraftTen: "MinecraftTen",
};
const FONT_SIZE_BASE = 0.5;

function safeLabelText(text: string): string {
  return /^[\d-]/.test(text) ? `§r${text}` : text;
}

export interface CenteredTextProps extends ControlProps {
  font?: TextFont;
  scale?: number;
  children?: string;
  width?: import("@bedrock-core/flexbox").FlexSize;
}

export function CenteredText({ children, font, scale, width = "100%", ...rest }: CenteredTextProps): JSX.Element {
  const resolvedScale = scale ?? 1.0;
  const resolvedText = children ?? "";
  return {
    type: "text",
    props: {
      ...withControl({ width, ...rest }),
      value: safeLabelText(resolvedText),
      fontType: FONT_TYPE_MAP[font ?? "mojangles"] ?? "default",
      fontScaleFactor: resolvedScale / FONT_SIZE_BASE,
      __textMetrics: {
        font,
        fontSize: resolvedScale,
        resolvedText,
      },
      textAlignment: "center",
    },
  } as unknown as JSX.Element;
}
