import { useCallback, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import type { AppConfig, AppInfo } from "../types";
import {
  getInstalledApps,
  getRunningApps,
  getSlotConfig,
  getShellCwd,
  getSlotShortcutsEnabled,
  getThreeFingerAppSwitcherEnabled,
  setShellCwd,
  setThreeFingerAppSwitcherEnabled,
  setSlotShortcutsEnabled,
} from "../lib/tauri";

export interface AppData {
  apps: AppInfo[];
  runningApps: AppInfo[];
  refreshApps: () => Promise<void>;
  slots: (AppConfig | null)[];
  setSlots: (slots: (AppConfig | null)[]) => void;
  /** Folder `!` shell commands run in unless the query names one inline. */
  shellCwd: string;
  /** Persist a new default shell folder; resolves to the path actually stored. */
  saveShellCwd: (path: string) => Promise<string>;
  home: string;
  /** Whether the global ⌥1–9 quick-slot shortcuts are active. */
  slotShortcutsEnabled: boolean;
  /** Toggle ⌥1–9 on/off, persisting and (un)registering the global hotkeys. */
  toggleSlotShortcuts: () => Promise<void>;
  /** Whether a vertical three-finger swipe opens the running-app menu. */
  threeFingerAppSwitcherEnabled: boolean;
  /** Toggle the persisted three-finger running-app gesture. */
  toggleThreeFingerAppSwitcher: () => Promise<void>;
}

/** Loads installed apps, slot config, the shell folder and the home dir once on mount. */
export function useAppData(): AppData {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [runningApps, setRunningApps] = useState<AppInfo[]>([]);
  const [slots, setSlots] = useState<(AppConfig | null)[]>(Array(9).fill(null));
  const [shellCwd, setShellCwdState] = useState("~");
  const [home, setHome] = useState("~");
  const [slotShortcutsEnabled, setSlotShortcutsEnabledState] = useState(true);
  const [threeFingerAppSwitcherEnabled, setThreeFingerAppSwitcherEnabledState] =
    useState(false);

  // Re-scan installed apps. Cheap (a directory walk), so it's safe to call on
  // every window show to pick up newly installed/removed apps.
  const refreshApps = useCallback(
    () =>
      Promise.all([
        getInstalledApps().then(setApps),
        getRunningApps().then(setRunningApps),
      ]).then(() => undefined),
    [],
  );

  const saveShellCwd = useCallback(async (path: string) => {
    const resolved = await setShellCwd(path);
    setShellCwdState(resolved);
    return resolved;
  }, []);

  const toggleSlotShortcuts = useCallback(async () => {
    const next = await setSlotShortcutsEnabled(!slotShortcutsEnabled);
    setSlotShortcutsEnabledState(next);
  }, [slotShortcutsEnabled]);

  const toggleThreeFingerAppSwitcher = useCallback(async () => {
    const next = await setThreeFingerAppSwitcherEnabled(
      !threeFingerAppSwitcherEnabled,
    );
    setThreeFingerAppSwitcherEnabledState(next);
  }, [threeFingerAppSwitcherEnabled]);

  useEffect(() => {
    refreshApps();
    getSlotConfig().then((c) => setSlots(c.slots));
    getShellCwd().then(setShellCwdState);
    getSlotShortcutsEnabled().then(setSlotShortcutsEnabledState);
    getThreeFingerAppSwitcherEnabled().then(
      setThreeFingerAppSwitcherEnabledState,
    );
    homeDir().then((h) => setHome(h.replace(/\/$/, "")));
  }, [refreshApps]);

  return {
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
  };
}
