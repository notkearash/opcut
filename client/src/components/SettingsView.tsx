import { useEffect } from "react";
import type { AppConfig, AppInfo } from "../types";
import { setSlotConfig } from "../lib/tauri";
import SlotGrid from "./SlotGrid";
import AppPicker from "./AppPicker";

interface SettingsViewProps {
  apps: AppInfo[];
  slots: (AppConfig | null)[];
  onSlotsChange: (slots: (AppConfig | null)[]) => void;
  /** Slot whose app-picker is open, or null. Controlled by App so the
   *  global ⌥1–9 shortcut (delivered via the `assign-slot` event) can open it. */
  pickerSlot: number | null;
  onPickerSlotChange: (slot: number | null) => void;
  /** Bundle path → PNG data URI, and the loader for paths not yet fetched. */
  icons: Record<string, string>;
  requestIcons: (paths: string[]) => void;
  onClose: () => void;
}

/** Quick-slot configuration. Reuses the original SlotGrid + AppPicker. */
export default function SettingsView({
  apps,
  slots,
  onSlotsChange,
  pickerSlot,
  onPickerSlotChange,
  icons,
  requestIcons,
  onClose,
}: SettingsViewProps) {
  // Esc backs out. ⌥1–9 is a global shortcut handled in Rust (it never reaches
  // the webview), so the slot opens via the `assign-slot` event in App, not here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pickerSlot !== null) return; // AppPicker owns the keyboard while open
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerSlot, onClose]);

  const handleSelect = async (app: AppInfo | null) => {
    if (pickerSlot === null) return;
    const cfg: AppConfig | null = app ? { name: app.name, path: app.path } : null;
    const updated = await setSlotConfig(pickerSlot, cfg);
    onSlotsChange(updated.slots);
    onPickerSlotChange(null);
  };

  return (
    <div className="settings-view">
      <div className="settings-header">
        <span className="settings-title">Quick slots</span>
        <span className="settings-hint">press ⌥1–9 to assign · ⌘⌫ clears</span>
        <button className="settings-done" onClick={onClose}>
          esc
        </button>
      </div>
      <SlotGrid slots={slots} icons={icons} onSlotClick={onPickerSlotChange} />
      {pickerSlot !== null && (
        <AppPicker
          key={pickerSlot}
          apps={apps}
          slotIndex={pickerSlot}
          icons={icons}
          requestIcons={requestIcons}
          onSelect={handleSelect}
          onClose={() => onPickerSlotChange(null)}
        />
      )}
    </div>
  );
}
