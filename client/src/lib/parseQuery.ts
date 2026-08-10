import type { ParsedQuery } from "../types";

interface ParseContext {
  homeDir: string;
  /** Configured default shell folder, used when the query has no inline `@ <path>`. */
  defaultCwd: string;
}

/** Display-expand a leading `~` using the known home dir. */
export function expandTilde(path: string, homeDir: string): string {
  const p = path.trim();
  if (p === "~") return homeDir;
  if (p.startsWith("~/")) return `${homeDir}/${p.slice(2)}`;
  return p;
}

// A cwd marker is ` @ ` followed by a path-like token (starts with ~, /, or .).
const CWD_MARKER = /\s@\s+([~/.][^\s]*)\s*$/;

export function parseQuery(raw: string, ctx: ParseContext): ParsedQuery {
  // Keep a trailing space significant (">cwd " means "the command is chosen, type the
  // path") while ignoring leading whitespace.
  const s = raw.replace(/^\s+/, "");
  if (s.length === 0) return { kind: "empty" };

  // Command palette — "> …". `head`/`arg` split lets a command take an argument
  // (">cwd ~/src") while `partial` still fuzzes over the whole thing for filtering.
  if (s[0] === ">") {
    const rest = s.slice(1).replace(/^\s+/, "");
    const sp = rest.indexOf(" ");
    return {
      kind: "command-menu",
      partial: rest.trim().toLowerCase(),
      head: (sp === -1 ? rest : rest.slice(0, sp)).toLowerCase(),
      arg: sp === -1 ? "" : rest.slice(sp + 1).trim(),
    };
  }

  // Running-app search — "/ …" lists apps that are already open.
  if (s[0] === "/") {
    return { kind: "running-apps", text: s.slice(1).trim() };
  }

  // Shell prefix — "! <command>" runs a shell command in a terminal.
  if (s[0] === "!") {
    let rest = s.slice(1).trim();

    let cwd = ctx.defaultCwd;
    let cwdSource: "inline" | "default" = "default";
    const cwdMatch = rest.match(CWD_MARKER);
    if (cwdMatch) {
      cwd = cwdMatch[1];
      cwdSource = "inline";
      rest = rest.slice(0, cwdMatch.index).trim();
    }

    return {
      kind: "shell",
      command: rest,
      cwd: expandTilde(cwd, ctx.homeDir),
      cwdSource,
    };
  }

  return { kind: "apps", text: s.trim() };
}
