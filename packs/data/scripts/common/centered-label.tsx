import { Panel, Text, type TextProps, type JSX } from "@bedrock-core/ui";
import type { AlignSelf, FlexSize, Spacing } from "@bedrock-core/flexbox";

export interface CenteredLabelProps extends Omit<TextProps, "children" | "width" | "height"> {
  children: string;
  width?: FlexSize;
  height?: number;
  flexGrow?: number;
  flex?: number;
  alignSelf?: AlignSelf;
  margin?: Spacing;
  marginTop?: Spacing;
  marginRight?: Spacing;
  marginBottom?: Spacing;
  marginLeft?: Spacing;
  background?: string;
}

export function CenteredLabel({
  children,
  width = "100%",
  height = 24,
  flexGrow,
  flex,
  alignSelf,
  margin,
  marginTop,
  marginRight,
  marginBottom,
  marginLeft,
  background,
  ...textRest
}: CenteredLabelProps): JSX.Element {
  return (
    <Panel
      width={width}
      height={height}
      flexGrow={flexGrow}
      flex={flex}
      alignSelf={alignSelf}
      margin={margin}
      marginTop={marginTop}
      marginRight={marginRight}
      marginBottom={marginBottom}
      marginLeft={marginLeft}
      background={background}
      flexDirection="row"
      justifyContent="center"
      alignItems="center"
    >
      <Text {...textRest}>{children}</Text>
    </Panel>
  );
}
