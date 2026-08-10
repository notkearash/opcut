import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { AppInfo, ResultRow } from "./types";
import { useAppData } from "./hooks/useAppData";
import { useAppIcons } from "./hooks/useAppIcons";
import { useKeyboardNav } from "./hooks/useKeyboardNav";
import { useMouseRejection } from "./hooks/useMouseRejection";
import { parseQuery } from "./lib/parseQuery";
import { fuzzySearch } from "./lib/fuzzy";
import { joinIconPaths, splitIconPaths } from "./lib/iconPaths";
import {
  launchOrFocusApp,
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
type SwitcherPhase = "idle" | "cycling" | "search";

const SHELL_FOLDER_COMMAND_IDS = ["cwd", "folder", "dir"];
const TERMINATED_ROW_LINGER_MS = 1500;
const KILL_FAILED_ROW_LINGER_MS = 2600;
const COMMIT_RETRY_LIMIT = 30;
const COMMIT_RETRY_DELAY_MS = 16;
const RUNNING_APPS_QUERY = "/ ";

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

function isSlashKey(e: React.KeyboardEvent) {
  return e.code === "Slash" || e.key === "/";
}

function optionTypedLetter(e: React.KeyboardEvent) {
  if (!e.altKey || e.metaKey || e.ctrlKey) return null;
  const match = /^Key([A-Z])$/.exec(e.code);
  if (!match) return null;
  return e.shiftKey ? match[1] : match[1].toLowerCase();
}

function isVerticalArrow(e: React.KeyboardEvent) {
  return e.key === "ArrowDown" || e.key === "ArrowUp";
}

const switcherEvents: {
  cycle: (backward: boolean) => void;
  commit: () => void;
} = {
  cycle: () => {},
  commit: () => {},
};

const switcherSession = {
  phase: "idle" as SwitcherPhase,
  initialAdvancePending: false,
  commitRetries: 0,
};

function App() {
  const {
    apps,
    runningApps,
    refreshApps,
    slots,
    setSlots,
    shellCwd,
    saveShellCwd,
    home,
    slotShortcutsEnabled,
    toggleSlotShortcuts,
    threeFingerAppSwitcherEnabled,
    toggleThreeFingerAppSwitcher,
  } = useAppData();
  const { icons, iconsEnabled, toggleIcons, requestIcons } = useAppIcons();
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
        }, TERMINATED_ROW_LINGER_MS);
      } catch {
        setKillStateByPath((state) => ({ ...state, [app.path]: "failed" }));
        window.setTimeout(() => {
          setKillStateByPath((state) => removeKillState(state, app.path));
          refreshApps();
        }, KILL_FAILED_ROW_LINGER_MS);
      }
    },
    [refreshApps],
  );

  const parsed = useMemo(
    () =>
      parseQuery(query, { homeDir: home, defaultCwd: shellCwd }),
    [query, home, shellCwd],
  );

  const results = useMemo<ResultRow[]>(() => {
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
      if (SHELL_FOLDER_COMMAND_IDS.includes(parsed.commandWord)) {
        const pathArg = parsed.commandArgument;
        return [
          {
            kind: "command" as const,
            id: "cmd-cwd",
            badge: "›",
            title: pathArg
              ? `Set shell folder to ${pathArg}`
              : `Shell folder · ${shellCwd.replace(home, "~")}`,
            subtitle: pathArg
              ? "saved for every ! command · ↵ to confirm"
              : "type a path after the command, e.g. > cwd ~/src",
            onActivate: pathArg
              ? () => {
                  saveShellCwd(pathArg).finally(hideAndReset);
                }
              : () => setQuery(">cwd "),
          },
        ];
      }

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
          id: "cwd",
          title: "Set shell folder",
          subtitle: `where ! commands run · now ${shellCwd.replace(home, "~")}`,
          run: () => setQuery(">cwd "),
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
          id: "icons",
          title: iconsEnabled ? "Hide app icons" : "Show app icons",
          subtitle: iconsEnabled
            ? "show a letter mark instead of each app's icon"
            : "show each app's real macOS icon in the results",
          run: () => {
            toggleIcons();
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
            c.id.startsWith(parsed.filterText) ||
            c.title.toLowerCase().includes(parsed.filterText),
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
          iconBundlePath: m.item.path,
          matchIndicesInTitle: m.indices,
          onActivate: () => launchOrFocusApp(m.item.path).finally(hideAndReset),
        }));
    }

    if (parsed.kind === "running-apps") {
      const inMostRecentlyActiveOrder = runningApps.map((item) => ({
        item,
        indices: [] as number[],
      }));
      const matches = parsed.text
        ? fuzzySearch(parsed.text, runningApps, (a) => a.name)
        : inMostRecentlyActiveOrder;
      return matches
        .filter((m) => !hiddenRunningAppPaths.includes(m.item.path))
        .map((m) => {
          const status = killStateByPath[m.item.path];
          return {
            kind: "app" as const,
            id: `running-${m.item.path}`,
            title: killTitle(status) ?? m.item.name,
            iconBundlePath: m.item.path,
            subtitle: status ? m.item.name : undefined,
            matchIndicesInTitle: status ? undefined : m.indices,
            status,
            onActivate: status
              ? () => {}
              : () => launchOrFocusApp(m.item.path).finally(hideAndReset),
            onKill:
              status === undefined ? () => killRunningApp(m.item) : undefined,
          };
        });
    }

    return slots
      .map((app, i) => ({ app, i }))
      .filter((s): s is { app: NonNullable<typeof s.app>; i: number } => s.app !== null)
      .map(({ app, i }) => ({
        kind: "slot" as const,
        id: `slot-${i}`,
        badge: String(i + 1),
        iconBundlePath: app.path,
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
    shellCwd,
    saveShellCwd,
    hideAndReset,
    killRunningApp,
    refreshApps,
    slotShortcutsEnabled,
    toggleSlotShortcuts,
    threeFingerAppSwitcherEnabled,
    toggleThreeFingerAppSwitcher,
    iconsEnabled,
    toggleIcons,
  ]);

  const iconPathsToLoad = useMemo(
    () =>
      iconsEnabled
        ? joinIconPaths(
            results
              .map((r) => r.iconBundlePath)
              .filter((p): p is string => Boolean(p)),
          )
        : "",
    [results, iconsEnabled],
  );

  useEffect(() => {
    if (!iconPathsToLoad) return;
    requestIcons(splitIconPaths(iconPathsToLoad));
  }, [iconPathsToLoad, requestIcons]);

  const { selected, setSelected, onKeyDown } = useKeyboardNav(
    results,
    hideAndReset,
    switcherPhase === "cycling",
  );

  const { acceptHover, disarmHover } = useMouseRejection();

  const handleHover = useCallback(
    (i: number, e: React.MouseEvent) => {
      if (acceptHover(e)) setSelected(i);
    },
    [acceptHover, setSelected],
  );

  const cycleSelection = useCallback(
    (backward: boolean) => {
      const count = results.length;
      if (count === 0) return;
      disarmHover();
      switcherSession.initialAdvancePending = false;
      setSelected((s) => {
        const clamped = Math.min(s, count - 1);
        return backward ? (clamped - 1 + count) % count : (clamped + 1) % count;
      });
    },
    [results, setSelected, disarmHover],
  );

  const commitSelection = useCallback(() => {
    if (switcherSession.phase !== "cycling") return;
    const openRenderHasNotLandedYet = parsed.kind !== "running-apps";
    if (openRenderHasNotLandedYet) {
      if (switcherSession.commitRetries < COMMIT_RETRY_LIMIT) {
        switcherSession.commitRetries += 1;
        window.setTimeout(() => switcherEvents.commit(), COMMIT_RETRY_DELAY_MS);
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

  useEffect(() => {
    const showFreshPrompt = () => {
      if (gestureOpenPending.current) {
        gestureOpenPending.current = false;
      } else {
        setQuery("");
      }
      setView("search");
      setPickerSlot(null);
      inputRef.current?.focus();
      refreshApps();
      resetKillUi();
    };
    const hideAndForgetSession = () => {
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
    };
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      disarmHover();
      if (focused) showFreshPrompt();
      else hideAndForgetSession();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshApps, resetKillUi, changeSwitcherPhase, disarmHover]);

  const openRunningApps = useCallback(() => {
    gestureOpenPending.current = true;
    setQuery(RUNNING_APPS_QUERY);
    setView("search");
    setPickerSlot(null);
    resetKillUi();
    refreshApps();
    disarmHover();
    inputRef.current?.focus();
  }, [refreshApps, resetKillUi, disarmHover]);

  useEffect(() => {
    const unlisten = listen("show-running-apps", openRunningApps);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openRunningApps]);

  useEffect(() => {
    const unlisten = listen("switcher-open", () => {
      switcherSession.initialAdvancePending = true;
      switcherSession.commitRetries = 0;
      changeSwitcherPhase("cycling");
      openRunningApps();
      const secondMostRecentApp = 1;
      setSelected(secondMostRecentApp);
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

  useEffect(() => {
    const unlisten = listen<number>("assign-slot", ({ payload: slot }) => {
      setView("settings");
      setPickerSlot(slot);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (view === "search") inputRef.current?.focus();
  }, [view, results]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (switcherSession.phase === "cycling" && isSlashKey(e)) {
        e.preventDefault();
        changeSwitcherPhase("search");
        switcherEnterSearch().catch(() => {});
        return;
      }
      if (switcherSession.phase === "search") {
        const letter = optionTypedLetter(e);
        if (letter) {
          e.preventDefault();
          setQuery((q) => q + letter);
          return;
        }
      }
      if (isVerticalArrow(e)) disarmHover();
      onKeyDown(e);
    },
    [onKeyDown, changeSwitcherPhase, disarmHover],
  );

  const lastWindowHeight = useRef(0);
  useLayoutEffect(() => {
    const height =
      view === "settings"
        ? settingsWindowHeight()
        : windowHeight(results.length, query.trim().length > 0);
    if (height === lastWindowHeight.current) return;
    lastWindowHeight.current = height;
    const raf = requestAnimationFrame(() => {
      getCurrentWindow().setSize(new LogicalSize(WIN_W, height));
    });
    return () => cancelAnimationFrame(raf);
  }, [results.length, view, query]);

  if (view === "settings") {
    return (
      <div className="shell">
        <SettingsView
          apps={apps}
          slots={slots}
          onSlotsChange={setSlots}
          pickerSlot={pickerSlot}
          onPickerSlotChange={setPickerSlot}
          iconsByBundlePath={iconsEnabled ? icons : {}}
          requestIcons={requestIcons}
          onClose={() => {
            setView("search");
            setPickerSlot(null);
          }}
        />
      </div>
    );
  }

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
        shellActive={shellActive}
        onOpenSettings={() => setView("settings")}
      />
      {results.length > 0 && (
        <>
          <div className="divider" />
          <ResultList
            rows={results}
            selected={selected}
            iconsByBundlePath={iconsEnabled ? icons : {}}
            onHover={handleHover}
          />
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
