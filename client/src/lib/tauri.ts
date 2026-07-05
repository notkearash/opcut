import { invoke } from "@tauri-apps/api/core";
import type { AgentConfig, AppInfo, AppConfig, SlotConfig } from "../types";

export const getInstalledApps = () => invoke<AppInfo[]>("get_installed_apps");

export const getRunningApps = () => invoke<AppInfo[]>("get_running_apps");

export const getSlotConfig = () => invoke<SlotConfig>("get_slot_config");

export const setSlotConfig = (slotIndex: number, appConfig: AppConfig | null) =>
  invoke<SlotConfig>("set_slot_config", { slotIndex, appConfig });

export const launchOrFocusApp = (path: string) =>
  invoke<void>("launch_or_focus_app", { path });

export const terminateRunningApp = (path: string) =>
  invoke<void>("terminate_running_app", { path });

export const getAgentConfig = () => invoke<AgentConfig>("get_agent_config");

export const setAgentConfig = (config: AgentConfig) =>
  invoke<AgentConfig>("set_agent_config", { config });

export const runAgentQuery = (agentId: string, prompt: string, cwd: string) =>
  invoke<void>("run_agent_query", { agentId, prompt, cwd });

export const runShellCommand = (command: string, cwd: string) =>
  invoke<void>("run_shell_command", { command, cwd });

export const getSlotShortcutsEnabled = () =>
  invoke<boolean>("get_slot_shortcuts_enabled");

export const setSlotShortcutsEnabled = (enabled: boolean) =>
  invoke<boolean>("set_slot_shortcuts_enabled", { enabled });
