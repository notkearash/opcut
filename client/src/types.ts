export interface AppInfo {
  name: string;
  path: string;
}

export interface AppConfig {
  name: string;
  path: string;
}

export interface SlotConfig {
  slots: (AppConfig | null)[];
}

export type ResultKind = "app" | "slot" | "command" | "shell";

export interface ResultRow {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle?: string;
  matchIndicesInTitle?: number[];
  badge?: string;
  iconBundlePath?: string;
  status?: "terminating" | "terminated" | "failed";
  onActivate: () => void | Promise<void>;
  onKill?: () => void | Promise<void>;
}

export type ParsedQuery =
  | {
      kind: "command-menu";
      filterText: string;
      commandWord: string;
      commandArgument: string;
    }
  | { kind: "running-apps"; text: string }
  | {
      kind: "shell";
      command: string;
      cwd: string;
      cwdSource: "inline" | "default";
    }
  | { kind: "apps"; text: string }
  | { kind: "empty" };
