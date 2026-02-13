export interface AppInfo {
  name: string;
  path: string;
}

export interface AppConfig {
  name: string;
  path: string;
}

export interface SlotConfig {
  slots: (AppConfig | null)[];
}
