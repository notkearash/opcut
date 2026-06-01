import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { ResultRow } from "./types";
import { useAppData } from "./hooks/useAppData";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { parseQuery } from "./lib/parseQuery";
import { fuzzySearch } from "./lib/fuzzy";
import { launchOrFocusApp, runAgentQuery, runShellCommand } from "./lib/tauri";
import {
  MAX_VISIBLE,
  WIN_W,
  settingsWindowHeight,
  windowHeight,
} from "./lib/layout";
import SearchBar from "./components/SearchBar";
import ResultList from "./components/ResultList";
import SettingsView from "./components/SettingsView";
import "./App.css";

type View = "search" | "settings";

function App() {
  const { apps, slots, setSlots, agentConfig, home } = useAppData();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("search");
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hideAndReset = useCallback(() => {
    getCurrentWindow().hide();
    setQuery("");
    setView("search");
    setPickerSlot(null);
  }, []);

  // --- query parsing & result building -------------------------------------
  const parsed = useMemo(
    () =>
      parseQuery(query, {
        homeDir: home,
        defaultCwd: agentConfig?.default_cwd ?? "~",
        agents: agentConfig?.agents ?? [],
      }),
    [query, home, agentConfig],
  );

  const results = useMemo<ResultRow[]>(() => {
    if (parsed.kind === "agent") {
      const cwdLabel = parsed.cwd.replace(home, "~");
      return [
        {
          kind: "agent",
          id: "agent-run",
          badge: `?${parsed.agentId}`,
          title: parsed.prompt || `Open ${parsed.label}`,
          subtitle: `${parsed.label} · ${cwdLabel}${parsed.cwdSource === "default" ? " (default)" : ""}`,
          onActivate: () =>
            runAgentQuery(parsed.agentId, parsed.prompt, parsed.cwd).finally(
              hideAndReset,
            ),
        },
      ];
    }

    if (parsed.kind === "agent-menu") {
      const agents = agentConfig?.agents ?? [];
      return agents
        .filter(
          (a) =>
            a.id.startsWith(parsed.partial) ||
            a.label.toLowerCase().startsWith(parsed.partial),
        )
        .map((a) => ({
          kind: "agent" as const,
          id: `agent-menu-${a.id}`,
          badge: `?${a.id}`,
          title: a.label,
          subtitle: `coding agent · runs ${a.program}`,
          onActivate: () => {
            setQuery(`?${a.id} `);
            inputRef.current?.focus();
          },
        }));
    }

    if (parsed.kind === "shell") {
      const cwdLabel = parsed.cwd.replace(home, "~");
      if (!parsed.command) {
        return [
          {
            kind: "shell",
            id: "shell-hint",
            badge: "!",
            title: "Run a shell command",
            subtitle: `type a command · ${cwdLabel}`,
            onActivate: () => {},
          },
        ];
      }
      return [
        {
          kind: "shell",
          id: "shell-run",
          badge: "!",
          title: parsed.command,
          subtitle: `run in terminal · ${cwdLabel}${parsed.cwdSource === "default" ? " (default)" : ""}`,
          onActivate: () =>
            runShellCommand(parsed.command, parsed.cwd).finally(hideAndReset),
        },
      ];
    }

    if (parsed.kind === "command-menu") {
      const commands = [
        {
          id: "slots",
          title: "Configure quick slots",
          subtitle: "assign apps to ⌥1–9",
          run: () => setView("settings"),
        },
      ];
      return commands
        .filter(
          (c) =>
            c.id.startsWith(parsed.partial) ||
            c.title.toLowerCase().includes(parsed.partial),
        )
        .map((c) => ({
          kind: "command" as const,
          id: `cmd-${c.id}`,
          badge: "›",
          title: c.title,
          subtitle: c.subtitle,
          onActivate: c.run,
        }));
    }

    if (parsed.kind === "apps") {
      return fuzzySearch(parsed.text, apps, (a) => a.name)
        .slice(0, MAX_VISIBLE)
        .map((m) => ({
          kind: "app" as const,
          id: m.item.path,
          title: m.item.name,
          matchIndices: m.indices,
          onActivate: () => launchOrFocusApp(m.item.path).finally(hideAndReset),
        }));
    }

    // empty query → assigned quick slots
    return slots
      .map((app, i) => ({ app, i }))
      .filter((s): s is { app: NonNullable<typeof s.app>; i: number } => s.app !== null)
      .map(({ app, i }) => ({
        kind: "slot" as const,
        id: `slot-${i}`,
        badge: String(i + 1),
        title: app.name,
        subtitle: `⌥${i + 1}`,
        onActivate: () => launchOrFocusApp(app.path).finally(hideAndReset),
      }));
  }, [parsed, apps, slots, home, hideAndReset, agentConfig]);

  const { selected, setSelected, onKeyDown } = useKeyboardNav(results, hideAndReset);

  // --- window lifecycle ----------------------------------------------------
  // Reset to a fresh prompt on show; hide + reset on focus loss.
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        setQuery("");
        setView("search");
        setPickerSlot(null);
        inputRef.current?.focus();
      } else {
        getCurrentWindow().hide();
        setQuery("");
        setView("search");
        setPickerSlot(null);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Global ⌥1–9 while the window is open: Rust emits `assign-slot` (it can't
  // reach the webview as a keystroke). Jump into settings with that slot's picker.
  useEffect(() => {
    const unlisten = listen<number>("assign-slot", ({ payload: slot }) => {
      setView("settings");
      setPickerSlot(slot);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Keep focus on the input whenever we're in search view.
  useEffect(() => {
    if (view === "search") inputRef.current?.focus();
  }, [view, results]);

  // --- dynamic window height ----------------------------------------------
  const lastH = useRef(0);
  useLayoutEffect(() => {
    const h =
      view === "settings"
        ? settingsWindowHeight()
        : windowHeight(results.length, query.trim().length > 0);
    if (h === lastH.current) return;
    lastH.current = h;
    const raf = requestAnimationFrame(() => {
      getCurrentWindow().setSize(new LogicalSize(WIN_W, h));
    });
    return () => cancelAnimationFrame(raf);
  }, [results.length, view, query]);

  // --- render --------------------------------------------------------------
  if (view === "settings") {
    return (
      <div className="shell">
        <SettingsView
          apps={apps}
          slots={slots}
          onSlotsChange={setSlots}
          pickerSlot={pickerSlot}
          onPickerSlotChange={setPickerSlot}
          onClose={() => {
            setView("search");
            setPickerSlot(null);
          }}
        />
      </div>
    );
  }

  const agentLabel = parsed.kind === "agent" ? parsed.label : undefined;
  const aiActive = parsed.kind === "agent" || parsed.kind === "agent-menu";
  const shellActive = parsed.kind === "shell";
  const hasQuery = query.trim().length > 0;

  return (
    <div className="shell">
      <SearchBar
        ref={inputRef}
        value={query}
        onChange={setQuery}
        onKeyDown={onKeyDown}
        aiActive={aiActive}
        shellActive={shellActive}
        agentLabel={agentLabel}
        onOpenSettings={() => setView("settings")}
      />
      {results.length > 0 && (
        <>
          <div className="divider" />
          <ResultList rows={results} selected={selected} onHover={setSelected} />
          <Footer count={results.length} />
        </>
      )}
      {results.length === 0 && hasQuery && (
        <>
          <div className="divider" />
          <div className="empty-state">
            {parsed.kind === "apps" ? "No matching apps" : "No results"}
          </div>
          <Footer count={0} />
        </>
      )}
    </div>
  );
}

function Footer({ count }: { count: number }) {
  return (
    <div className="footer">
      <span className="footer-left">
        {count > 0 ? `${count} result${count === 1 ? "" : "s"}` : ""}
      </span>
      <span className="footer-keys">
        <kbd>↑↓</kbd> navigate <kbd>↵</kbd> open <kbd>esc</kbd> dismiss
      </span>
    </div>
  );
}

export default App;
