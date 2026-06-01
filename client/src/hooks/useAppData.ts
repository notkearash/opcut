import { useEffect, useState } from "react";
import { homeDir } from "@tauri-apps/api/path";
import type { AgentConfig, AppConfig, AppInfo } from "../types";
import {
  getAgentConfig,
  getInstalledApps,
  getSlotConfig,
} from "../lib/tauri";

export interface AppData {
  apps: AppInfo[];
  slots: (AppConfig | null)[];
  setSlots: (slots: (AppConfig | null)[]) => void;
  agentConfig: AgentConfig | null;
  home: string;
}

/** Loads installed apps, slot config, agent config and the home dir once on mount. */
export function useAppData(): AppData {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [slots, setSlots] = useState<(AppConfig | null)[]>(Array(9).fill(null));
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [home, setHome] = useState("~");

  useEffect(() => {
    getInstalledApps().then(setApps);
    getSlotConfig().then((c) => setSlots(c.slots));
    getAgentConfig().then(setAgentConfig);
    homeDir().then((h) => setHome(h.replace(/\/$/, "")));
  }, []);

  return { apps, slots, setSlots, agentConfig, home };
}
