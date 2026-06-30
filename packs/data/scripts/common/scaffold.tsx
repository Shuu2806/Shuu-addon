import { Panel, type PanelProps, type JSX } from "@bedrock-core/ui";

export interface ScaffoldProps extends Omit<PanelProps, "width" | "minHeight" | "alignItems" | "justifyContent"> {
  children?: JSX.Node;
}

export function Scaffold({ children, ...rest }: ScaffoldProps): JSX.Element {
  return (
    <Panel
      width="100%"
      minHeight="100%"
      alignItems="center"
      justifyContent="center"
      {...rest}
    >
      {children}
    </Panel>
  );
}
