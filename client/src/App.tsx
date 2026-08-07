import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { AppInfo, ResultRow } from "./types";
import { useAppData } from "./hooks/useAppData";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { parseQuery } from "./lib/parseQuery";
import { fuzzySearch } from "./lib/fuzzy";
import {
  launchOrFocusApp,
  runAgentQuery,
  runShellCommand,
  switcherCancel,
  switcherEnterSearch,
  terminateRunningApp,
} from "./lib/tauri";
import {
  WIN_W,
  settingsWindowHeight,
  windowHeight,
} from "./lib/layout";
import SearchBar from "./components/SearchBar";
import ResultList from "./components/ResultList";
import SettingsView from "./components/SettingsView";
import "./App.css";

type View = "search" | "settings";
type KillStatus = "terminating" | "terminated" | "failed";
/** ⌥Tab switcher session: "cycling" = releasing Option focuses the highlighted app;
 *  "search" = `/` was pressed, release is disarmed and the user is typing a query. */
type SwitcherPhase = "idle" | "cycling" | "search";

function killTitle(status?: KillStatus) {
  if (status === "terminating") return "Terminating...";
  if (status === "terminated") return "Terminated";
  if (status === "failed") return "Could not quit";
  return undefined;
}

function removeKillState(state: Record<string, KillStatus>, path: string) {
  const next = { ...state };
  delete next[path];
  return next;
}

// Bridges the Rust switcher events to the current render's handlers. Module scope —
// the launcher window mounts a single App — so the Tauri listeners can register once
// and never re-subscribe (a re-subscription gap could drop a rapid ⌥Tab press).
const switcherEvents: {
  cycle: (backward: boolean) => void;
  commit: () => void;
} = {
  cycle: () => {},
  commit: () => {},
};

// Mutable ⌥Tab session bookkeeping, module scope for the same singleton reason.
// `phase` mirrors the React state for handlers that need the value synchronously —
// a commit event arriving right after `/` must already observe "search".
const switcherSession = {
  phase: "idle" as SwitcherPhase,
  /** Set on open; commits that outrun the open render fall back to index 1. */
  initialAdvancePending: false,
  /** Retry budget for a commit that arrives before the open render exists. */
  commitRetries: 0,
};

function App() {
  const {
    apps,
    runningApps,
    refreshApps,
    slots,
    setSlots,
    agentConfig,
    home,
    slotShortcutsEnabled,
    toggleSlotShortcuts,
    threeFingerAppSwitcherEnabled,
    toggleThreeFingerAppSwitcher,
  } = useAppData();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("search");
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const [killStateByPath, setKillStateByPath] = useState<Record<string, KillStatus>>({});
  const [hiddenRunningAppPaths, setHiddenRunningAppPaths] = useState<string[]>([]);
  const [switcherPhase, setSwitcherPhase] = useState<SwitcherPhase>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const gestureOpenPending = useRef(false);

  const changeSwitcherPhase = useCallback((phase: SwitcherPhase) => {
    switcherSession.phase = phase;
    setSwitcherPhase(phase);
  }, []);

  const resetKillUi = useCallback(() => {
    setKillStateByPath({});
    setHiddenRunningAppPaths([]);
  }, []);

  const hideAndReset = useCallback(() => {
    getCurrentWindow().hide();
    setQuery("");
    setView("search");
    setPickerSlot(null);
    resetKillUi();
    switcherSession.initialAdvancePending = false;
    switcherSession.commitRetries = 0;
    changeSwitcherPhase("idle");
    switcherCancel().catch(() => {});
  }, [resetKillUi, changeSwitcherPhase]);

  const killRunningApp = useCallback(
    async (app: AppInfo) => {
      setKillStateByPath((state) => ({ ...state, [app.path]: "terminating" }));
      try {
        await terminateRunningApp(app.path);
        setKillStateByPath((state) => ({ ...state, [app.path]: "terminated" }));
        window.setTimeout(() => {
          setHiddenRunningAppPaths((paths) =>
            paths.includes(app.path) ? paths : [...paths, app.path],
          );
          setKillStateByPath((state) => removeKillState(state, app.path));
          refreshApps();
        }, 1500);
      } catch {
        setKillStateByPath((state) => ({ ...state, [app.path]: "failed" }));
        window.setTimeout(() => {
          setKillStateByPath((state) => removeKillState(state, app.path));
          refreshApps();
        }, 2600);
      }
    },
    [refreshApps],
  );

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
          id: "refresh",
          title: "Refresh app list",
          subtitle: "re-scan for newly installed apps",
          run: () => {
            refreshApps();
            setQuery("");
          },
        },
        {
          id: "slots",
          title: "Configure quick slots",
          subtitle: "assign apps to ⌥1–9",
          run: () => setView("settings"),
        },
        {
          id: "shortcuts",
          title: slotShortcutsEnabled
            ? "Disable option shortcuts"
            : "Enable option shortcuts",
          subtitle: slotShortcutsEnabled
            ? "turn off the global ⌥1–9 quick-slot hotkeys"
            : "turn on the global ⌥1–9 quick-slot hotkeys",
          run: () => {
            toggleSlotShortcuts();
            setQuery("");
          },
        },
        {
          id: "gesture",
          title: threeFingerAppSwitcherEnabled
            ? "Disable three-finger app switcher"
            : "Enable three-finger app switcher",
          subtitle: threeFingerAppSwitcherEnabled
            ? "restore your previous macOS vertical swipe gestures"
            : "three fingers opens * apps · macOS overview moves to four",
          run: () => {
            toggleThreeFingerAppSwitcher();
            setQuery("");
          },
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
        .map((m) => ({
          kind: "app" as const,
          id: m.item.path,
          title: m.item.name,
          matchIndices: m.indices,
          onActivate: () => launchOrFocusApp(m.item.path).finally(hideAndReset),
        }));
    }

    if (parsed.kind === "running-apps") {
      // An empty `/` query preserves the backend's most-recently-active order.
      // Once the user types, fuzzy relevance takes precedence.
      const matches = parsed.text
        ? fuzzySearch(parsed.text, runningApps, (a) => a.name)
        : runningApps.map((item) => ({ item, indices: [] as number[] }));
      return matches
        .filter((m) => !hiddenRunningAppPaths.includes(m.item.path))
        .map((m) => {
          const status = killStateByPath[m.item.path];
          return {
            kind: "app" as const,
            id: `running-${m.item.path}`,
            title: killTitle(status) ?? m.item.name,
            subtitle: status ? m.item.name : undefined,
            matchIndices: status ? undefined : m.indices,
            status,
            onActivate: status
              ? () => {}
              : () => launchOrFocusApp(m.item.path).finally(hideAndReset),
            onKill:
              status === undefined ? () => killRunningApp(m.item) : undefined,
          };
        });
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
  }, [
    parsed,
    apps,
    runningApps,
    hiddenRunningAppPaths,
    killStateByPath,
    slots,
    home,
    hideAndReset,
    killRunningApp,
    agentConfig,
    refreshApps,
    slotShortcutsEnabled,
    toggleSlotShortcuts,
    threeFingerAppSwitcherEnabled,
    toggleThreeFingerAppSwitcher,
  ]);

  const { selected, setSelected, onKeyDown } = useKeyboardNav(
    results,
    hideAndReset,
    switcherPhase === "cycling",
  );

  // Further ⌥Tab (or ⇧⌥Tab) presses during the hold move the highlight.
  const cycleSelection = useCallback(
    (backward: boolean) => {
      const count = results.length;
      if (count === 0) return;
      switcherSession.initialAdvancePending = false;
      setSelected((s) => {
        const clamped = Math.min(s, count - 1);
        return backward ? (clamped - 1 + count) % count : (clamped + 1) % count;
      });
    },
    [results, setSelected],
  );

  // Option released while cycling: focus the highlighted app.
  const commitSelection = useCallback(() => {
    if (switcherSession.phase !== "cycling") return;
    if (parsed.kind !== "running-apps") {
      // Quick ⌥Tab tap: the commit outran the switcher-open render. Retry through
      // switcherEvents, which is re-pointed at the fresh handler after each render.
      if (switcherSession.commitRetries < 30) {
        switcherSession.commitRetries += 1;
        window.setTimeout(() => switcherEvents.commit(), 16);
      } else {
        hideAndReset();
      }
      return;
    }
    switcherSession.commitRetries = 0;
    changeSwitcherPhase("idle");
    if (results.length === 0) {
      hideAndReset();
      return;
    }
    // The commit can also outrun the open listener's setSelected(1) render.
    const index = switcherSession.initialAdvancePending
      ? Math.min(1, results.length - 1)
      : Math.min(selected, results.length - 1);
    switcherSession.initialAdvancePending = false;
    results[index].onActivate();
  }, [parsed, results, selected, changeSwitcherPhase, hideAndReset]);

  useEffect(() => {
    switcherEvents.cycle = cycleSelection;
    switcherEvents.commit = commitSelection;
  }, [cycleSelection, commitSelection]);

  // --- window lifecycle ----------------------------------------------------
  // Reset to a fresh prompt on show; hide + reset on focus loss.
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused) {
        if (gestureOpenPending.current) {
          gestureOpenPending.current = false;
        } else {
          setQuery("");
        }
        setView("search");
        setPickerSlot(null);
        inputRef.current?.focus();
        // Re-scan apps on every show so newly installed apps appear without a restart.
        refreshApps();
        resetKillUi();
      } else {
        gestureOpenPending.current = false;
        switcherSession.initialAdvancePending = false;
        switcherSession.commitRetries = 0;
        changeSwitcherPhase("idle");
        switcherCancel().catch(() => {});
        getCurrentWindow().hide();
        setQuery("");
        setView("search");
        setPickerSlot(null);
        resetKillUi();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshApps, resetKillUi, changeSwitcherPhase]);

  // Open the panel on the existing `/` running-app route. The pending ref makes
  // this resilient to either focus/event delivery order.
  const openRunningApps = useCallback(() => {
    gestureOpenPending.current = true;
    setQuery("/ ");
    setView("search");
    setPickerSlot(null);
    resetKillUi();
    refreshApps();
    inputRef.current?.focus();
  }, [refreshApps, resetKillUi]);

  // The native trackpad monitor opens the panel and requests the `/` route.
  useEffect(() => {
    const unlisten = listen("show-running-apps", openRunningApps);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openRunningApps]);

  // ⌥Tab pressed while idle: same `/` route, plus commit-on-Option-release.
  // Like ⌘Tab, the second app starts highlighted so a quick tap switches away
  // (selection survives the async list refresh — the reset is suspended while
  // cycling). With a single running app the commit/cycle clamps cover index 1.
  useEffect(() => {
    const unlisten = listen("switcher-open", () => {
      switcherSession.initialAdvancePending = true;
      switcherSession.commitRetries = 0;
      changeSwitcherPhase("cycling");
      openRunningApps();
      setSelected(1);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openRunningApps, changeSwitcherPhase, setSelected]);

  useEffect(() => {
    const unlistenCycle = listen<boolean>("switcher-cycle", ({ payload }) => {
      switcherEvents.cycle(payload);
    });
    const unlistenCommit = listen("switcher-commit", () => {
      switcherEvents.commit();
    });
    return () => {
      unlistenCycle.then((fn) => fn());
      unlistenCommit.then((fn) => fn());
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

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // `/` during the ⌥Tab hold: stay on the `/` route but disarm
      // commit-on-release. Matched by physical key (e.code — ⌥/ types "÷", so
      // e.key alone misses it) with an e.key fallback for non-ANSI layouts.
      if (
        switcherSession.phase === "cycling" &&
        (e.code === "Slash" || e.key === "/")
      ) {
        e.preventDefault();
        changeSwitcherPhase("search");
        switcherEnterSearch().catch(() => {});
        return;
      }
      // While Option is still held after `/`, letters would arrive as "å"-style
      // symbols; map them back so a fuzzy query can be typed immediately.
      if (
        switcherSession.phase === "search" &&
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        const letter = /^Key([A-Z])$/.exec(e.code);
        if (letter) {
          e.preventDefault();
          setQuery((q) => q + (e.shiftKey ? letter[1] : letter[1].toLowerCase()));
          return;
        }
      }
      onKeyDown(e);
    },
    [onKeyDown, changeSwitcherPhase],
  );

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
  const killHint = parsed.kind === "running-apps" && results.length > 0;

  return (
    <div className="shell">
      <SearchBar
        ref={inputRef}
        value={query}
        onChange={setQuery}
        onKeyDown={handleSearchKeyDown}
        aiActive={aiActive}
        shellActive={shellActive}
        agentLabel={agentLabel}
        onOpenSettings={() => setView("settings")}
      />
      {results.length > 0 && (
        <>
          <div className="divider" />
          <ResultList rows={results} selected={selected} onHover={setSelected} />
          <Footer count={results.length} killHint={killHint} />
        </>
      )}
      {results.length === 0 && hasQuery && (
        <>
          <div className="divider" />
          <div className="empty-state">
            {parsed.kind === "apps"
              ? "No matching apps"
              : parsed.kind === "running-apps"
                ? "No matching open apps"
                : "No results"}
          </div>
          <Footer count={0} killHint={killHint} />
        </>
      )}
    </div>
  );
}

function Footer({ count, killHint }: { count: number; killHint: boolean }) {
  return (
    <div className="footer">
      <span className="footer-left">
        {killHint ? (
          <span className="footer-note">
            <kbd className="kbd-kill">⇧⌫</kbd> asks the app to quit, like ⌘Q
          </span>
        ) : count > 0 ? (
          `${count} result${count === 1 ? "" : "s"}`
        ) : (
          ""
        )}
      </span>
      <span className="footer-keys">
        <kbd>↑↓</kbd> navigate <kbd>↵</kbd> {killHint ? "focus" : "open"}{" "}
        {killHint && (
          <>
            <kbd className="kbd-kill">⇧⌫</kbd> quit{" "}
          </>
        )}
        <kbd>esc</kbd> dismiss
      </span>
    </div>
  );
}

export default App;
