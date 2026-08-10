import { useCallback, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import type { AppConfig, AppInfo } from "../types";
import { SLOT_COUNT } from "../lib/layout";
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
  shellCwd: string;
  saveShellCwd: (path: string) => Promise<string>;
  home: string;
  slotShortcutsEnabled: boolean;
  toggleSlotShortcuts: () => Promise<void>;
  threeFingerAppSwitcherEnabled: boolean;
  toggleThreeFingerAppSwitcher: () => Promise<void>;
}

export function useAppData(): AppData {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [runningApps, setRunningApps] = useState<AppInfo[]>([]);
  const [slots, setSlots] = useState<(AppConfig | null)[]>(Array(SLOT_COUNT).fill(null));
  const [shellCwd, setShellCwdState] = useState("~");
  const [home, setHome] = useState("~");
  const [slotShortcutsEnabled, setSlotShortcutsEnabledState] = useState(true);
  const [threeFingerAppSwitcherEnabled, setThreeFingerAppSwitcherEnabledState] =
    useState(false);

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
