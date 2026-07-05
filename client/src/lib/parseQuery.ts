import type { AgentTemplate, ParsedQuery } from "../types";

interface ParseContext {
  homeDir: string;
  defaultCwd: string;
  agents: AgentTemplate[];
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
  // Keep a trailing space significant ("?oc " means "agent picked, type the task")
  // while ignoring leading whitespace.
  const s = raw.replace(/^\s+/, "");
  if (s.length === 0) return { kind: "empty" };

  // Command palette — "> …"
  if (s[0] === ">") {
    return { kind: "command-menu", partial: s.slice(1).trim().toLowerCase() };
  }

  // Running-app search — "* …" lists apps that are already open.
  if (s[0] === "*") {
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

  // Agent prefixes — "?" lists agents; "?oc <task>" runs one.
  if (s[0] === "?") {
    const sp = s.indexOf(" ");
    if (sp === -1) {
      // Still typing the prefix → show the agent menu, filtered by the letters so far.
      return { kind: "agent-menu", partial: s.slice(1).toLowerCase() };
    }
    const id = s.slice(1, sp).toLowerCase();
    const agent = ctx.agents.find((a) => a.id === id);
    if (agent) {
      let rest = s.slice(sp + 1).trim();

      let cwd = ctx.defaultCwd;
      let cwdSource: "inline" | "default" = "default";
      const cwdMatch = rest.match(CWD_MARKER);
      if (cwdMatch) {
        cwd = cwdMatch[1];
        cwdSource = "inline";
        rest = rest.slice(0, cwdMatch.index).trim();
      }

      return {
        kind: "agent",
        agentId: agent.id,
        label: agent.label,
        prompt: rest,
        cwd: expandTilde(cwd, ctx.homeDir),
        cwdSource,
      };
    }
    // Unknown agent id: fall through to app search.
  }

  return { kind: "apps", text: s.trim() };
}
