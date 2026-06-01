import { useEffect, useState } from "react";
import type { AppConfig, AppInfo } from "../types";
import { setSlotConfig } from "../lib/tauri";
import SlotGrid from "./SlotGrid";
import AppPicker from "./AppPicker";

interface SettingsViewProps {
  apps: AppInfo[];
  slots: (AppConfig | null)[];
  onSlotsChange: (slots: (AppConfig | null)[]) => void;
  onClose: () => void;
}

/** Quick-slot configuration. Reuses the original SlotGrid + AppPicker. */
export default function SettingsView({
  apps,
  slots,
  onSlotsChange,
  onClose,
}: SettingsViewProps) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  // Keyboard slot selection: plain 1–9 opens the picker for that slot, Esc goes back.
  // Plain digits (no ⌥) so they don't collide with the global ⌥1–9 launch shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pickerSlot !== null) return; // AppPicker owns the keyboard while open
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.altKey && !e.ctrlKey) {
        e.preventDefault();
        setPickerSlot(Number(e.key) - 1);
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
    setPickerSlot(null);
  };

  return (
    <div className="settings-view">
      <div className="settings-header">
        <span className="settings-title">Quick slots</span>
        <span className="settings-hint">press 1–9 to assign · ⌘⌫ clears</span>
        <button className="settings-done" onClick={onClose}>
          esc
        </button>
      </div>
      <SlotGrid slots={slots} onSlotClick={setPickerSlot} />
      {pickerSlot !== null && (
        <AppPicker
          apps={apps}
          slotIndex={pickerSlot}
          onSelect={handleSelect}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
