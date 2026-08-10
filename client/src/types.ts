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
  /** Indices of matched characters in `title`, for highlighting. */
  matchIndices?: number[];
  /** Glyph/badge shown at the leading edge (e.g. slot number, `!` for shell). */
  badge?: string;
  /** Bundle path whose macOS icon represents this row, when it has one. */
  iconPath?: string;
  status?: "terminating" | "terminated" | "failed";
  onActivate: () => void | Promise<void>;
  onKill?: () => void | Promise<void>;
}

export type ParsedQuery =
  | {
      kind: "command-menu";
      /** Everything after `>`, lowercased — matched against command ids and titles. */
      partial: string;
      /** First word after `>`, for commands that take an argument. */
      head: string;
      /** Raw remainder after that word, case preserved (it can be a path). */
      arg: string;
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
