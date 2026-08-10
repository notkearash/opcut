import { useEffect } from "react";
import type { AppConfig, AppInfo } from "../types";
import { setSlotConfig } from "../lib/tauri";
import SlotGrid from "./SlotGrid";
import AppPicker from "./AppPicker";

interface SettingsViewProps {
  apps: AppInfo[];
  slots: (AppConfig | null)[];
  onSlotsChange: (slots: (AppConfig | null)[]) => void;
  pickerSlot: number | null;
  onPickerSlotChange: (slot: number | null) => void;
  iconsByBundlePath: Record<string, string>;
  requestIcons: (paths: string[]) => void;
  onClose: () => void;
}

export default function SettingsView({
  apps,
  slots,
  onSlotsChange,
  pickerSlot,
  onPickerSlotChange,
  iconsByBundlePath,
  requestIcons,
  onClose,
}: SettingsViewProps) {
  useEffect(() => {
    const closeOnEscape = (e: KeyboardEvent) => {
      const appPickerOwnsTheKeyboard = pickerSlot !== null;
      if (appPickerOwnsTheKeyboard) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerSlot, onClose]);

  const assignSelectedApp = async (app: AppInfo | null) => {
    if (pickerSlot === null) return;
    const config: AppConfig | null = app ? { name: app.name, path: app.path } : null;
    const updated = await setSlotConfig(pickerSlot, config);
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
      <SlotGrid
        slots={slots}
        iconsByBundlePath={iconsByBundlePath}
        onSlotClick={onPickerSlotChange}
      />
      {pickerSlot !== null && (
        <AppPicker
          key={pickerSlot}
          apps={apps}
          slotIndex={pickerSlot}
          iconsByBundlePath={iconsByBundlePath}
          requestIcons={requestIcons}
          onSelect={assignSelectedApp}
          onClose={() => onPickerSlotChange(null)}
        />
      )}
    </div>
  );
}
