import { useCallback, useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import type { AgentConfig, AppConfig, AppInfo } from "../types";
import {
  getAgentConfig,
  getInstalledApps,
  getRunningApps,
  getSlotConfig,
  getSlotShortcutsEnabled,
  getThreeFingerAppSwitcherEnabled,
  setThreeFingerAppSwitcherEnabled,
  setSlotShortcutsEnabled,
} from "../lib/tauri";

export interface AppData {
  apps: AppInfo[];
  runningApps: AppInfo[];
  refreshApps: () => Promise<void>;
  slots: (AppConfig | null)[];
  setSlots: (slots: (AppConfig | null)[]) => void;
  agentConfig: AgentConfig | null;
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

/** Loads installed apps, slot config, agent config and the home dir once on mount. */
export function useAppData(): AppData {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [runningApps, setRunningApps] = useState<AppInfo[]>([]);
  const [slots, setSlots] = useState<(AppConfig | null)[]>(Array(9).fill(null));
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
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
    getAgentConfig().then(setAgentConfig);
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
    agentConfig,
    home,
    slotShortcutsEnabled,
    toggleSlotShortcuts,
    threeFingerAppSwitcherEnabled,
    toggleThreeFingerAppSwitcher,
  };
}
