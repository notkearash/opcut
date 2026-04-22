import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { AppInfo, AppConfig, SlotConfig } from "./types";
import SlotGrid from "./components/SlotGrid";
import AppPicker from "./components/AppPicker";
import "./App.css";

function App() {
  const [slots, setSlots] = useState<(AppConfig | null)[]>(Array(9).fill(null));
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  useEffect(() => {
    invoke<SlotConfig>("get_slot_config").then((config) => {
      setSlots(config.slots);
    });
    invoke<AppInfo[]>("get_installed_apps").then(setApps);
  }, []);

  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (!payload) {
        getCurrentWindow().hide();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<number>("open-picker", (event) => {
      setPickerSlot(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleSlotClick = useCallback((index: number) => {
    setPickerSlot(index);
  }, []);

  const handleAppSelect = useCallback(
    async (app: AppInfo | null) => {
      if (pickerSlot === null) return;

      const appConfig: AppConfig | null = app
        ? { name: app.name, path: app.path }
        : null;

      const config = await invoke<SlotConfig>("set_slot_config", {
        slotIndex: pickerSlot,
        appConfig,
      });
      setSlots(config.slots);
      setPickerSlot(null);
    },
    [pickerSlot],
  );

  return (
    <div className="container">
      <div className="header">
        <span className="title">opcut</span>
      </div>
      <SlotGrid slots={slots} onSlotClick={handleSlotClick} />
      {pickerSlot !== null && (
        <AppPicker
          apps={apps}
          slotIndex={pickerSlot}
          onSelect={handleAppSelect}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}

export default App;
