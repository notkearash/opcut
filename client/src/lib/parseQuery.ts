import type { ParsedQuery } from "../types";

interface ParseContext {
  homeDir: string;
  defaultCwd: string;
}

const COMMAND_MENU_PREFIX = ">";
const RUNNING_APPS_PREFIX = "/";
const SHELL_PREFIX = "!";
const LEADING_WHITESPACE = /^\s+/;
const INLINE_CWD_MARKER = /\s@\s+([~/.][^\s]*)\s*$/;

export function expandTilde(path: string, homeDir: string): string {
  const trimmed = path.trim();
  if (trimmed === "~") return homeDir;
  if (trimmed.startsWith("~/")) return `${homeDir}/${trimmed.slice(2)}`;
  return trimmed;
}

export function parseQuery(raw: string, ctx: ParseContext): ParsedQuery {
  const input = raw.replace(LEADING_WHITESPACE, "");
  if (input.length === 0) return { kind: "empty" };

  if (input.startsWith(COMMAND_MENU_PREFIX)) {
    const rest = input.slice(1).replace(LEADING_WHITESPACE, "");
    const firstSpace = rest.indexOf(" ");
    return {
      kind: "command-menu",
      filterText: rest.trim().toLowerCase(),
      commandWord: (firstSpace === -1 ? rest : rest.slice(0, firstSpace)).toLowerCase(),
      commandArgument: firstSpace === -1 ? "" : rest.slice(firstSpace + 1).trim(),
    };
  }

  if (input.startsWith(RUNNING_APPS_PREFIX)) {
    return { kind: "running-apps", text: input.slice(1).trim() };
  }

  if (input.startsWith(SHELL_PREFIX)) {
    let command = input.slice(1).trim();
    let cwd = ctx.defaultCwd;
    let cwdSource: "inline" | "default" = "default";

    const inlineCwd = command.match(INLINE_CWD_MARKER);
    if (inlineCwd) {
      cwd = inlineCwd[1];
      cwdSource = "inline";
      command = command.slice(0, inlineCwd.index).trim();
    }

    return {
      kind: "shell",
      command,
      cwd: expandTilde(cwd, ctx.homeDir),
      cwdSource,
    };
  }

  return { kind: "apps", text: input.trim() };
}
