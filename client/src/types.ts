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

export interface AgentTemplate {
  id: string;
  label: string;
  program: string;
  args_before: string[];
}

export interface AgentConfig {
  default_cwd: string;
  agents: AgentTemplate[];
  use_cd_fallback: boolean;
}

export type ResultKind = "app" | "agent" | "slot" | "command";

export interface ResultRow {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Indices of matched characters in `title`, for highlighting. */
  matchIndices?: number[];
  /** Glyph/badge shown at the leading edge (e.g. slot number, agent id). */
  badge?: string;
  onActivate: () => void | Promise<void>;
}

export type ParsedQuery =
  | {
      kind: "agent";
      agentId: string;
      label: string;
      prompt: string;
      cwd: string;
      cwdSource: "inline" | "default";
    }
  | { kind: "agent-menu"; partial: string }
  | { kind: "command-menu"; partial: string }
  | { kind: "apps"; text: string }
  | { kind: "empty" };
