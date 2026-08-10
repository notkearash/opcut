import { invoke } from "@tauri-apps/api/core";
import type { AppInfo, AppConfig, SlotConfig } from "../types";

export const getInstalledApps = () => invoke<AppInfo[]>("get_installed_apps");

export const getRunningApps = () => invoke<AppInfo[]>("get_running_apps");

export const getAppIcons = (paths: string[]) =>
  invoke<Record<string, string>>("get_app_icons", { paths });

export const getIconsEnabled = () => invoke<boolean>("get_icons_enabled");

export const setIconsEnabled = (enabled: boolean) =>
  invoke<boolean>("set_icons_enabled", { enabled });

export const getSlotConfig = () => invoke<SlotConfig>("get_slot_config");

export const setSlotConfig = (slotIndex: number, appConfig: AppConfig | null) =>
  invoke<SlotConfig>("set_slot_config", { slotIndex, appConfig });

export const launchOrFocusApp = (path: string) =>
  invoke<void>("launch_or_focus_app", { path });

export const terminateRunningApp = (path: string) =>
  invoke<void>("terminate_running_app", { path });

export const getShellCwd = () => invoke<string>("get_shell_cwd");

export const setShellCwd = (path: string) =>
  invoke<string>("set_shell_cwd", { path });

export const runShellCommand = (command: string, cwd: string) =>
  invoke<void>("run_shell_command", { command, cwd });

export const getSlotShortcutsEnabled = () =>
  invoke<boolean>("get_slot_shortcuts_enabled");

export const setSlotShortcutsEnabled = (enabled: boolean) =>
  invoke<boolean>("set_slot_shortcuts_enabled", { enabled });

export const switcherEnterSearch = () => invoke<void>("switcher_enter_search");

export const switcherCancel = () => invoke<void>("switcher_cancel");

export const getThreeFingerAppSwitcherEnabled = () =>
  invoke<boolean>("get_three_finger_app_switcher_enabled");

export const setThreeFingerAppSwitcherEnabled = (enabled: boolean) =>
  invoke<boolean>("set_three_finger_app_switcher_enabled", { enabled });
