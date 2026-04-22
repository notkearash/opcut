import { useState, useEffect, useRef } from "react";
import type { AppInfo } from "../types";

interface AppPickerProps {
  apps: AppInfo[];
  slotIndex: number;
  onSelect: (app: AppInfo | null) => void;
  onClose: () => void;
}

export default function AppPicker({
  apps,
  slotIndex,
  onSelect,
  onClose,
}: AppPickerProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = apps.filter((app) =>
    app.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="app-picker-overlay" onClick={onClose}>
      <div className="app-picker" onClick={(e) => e.stopPropagation()}>
        <div className="app-picker-header">
          <span>
            Slot {slotIndex + 1} — &#x2325;{slotIndex + 1}
          </span>
          <span className="app-picker-hint">&#x2318;⌫ to clear</span>
        </div>
        <input
          ref={inputRef}
          className="app-picker-search"
          type="text"
          placeholder="Search apps..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (filtered.length > 0) onSelect(filtered[0]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "Backspace" && e.metaKey) {
              e.preventDefault();
              onSelect(null);
            }
          }}
        />
        <div className="app-picker-list">
          {filtered.map((app) => (
            <button
              key={app.path}
              className="app-picker-item"
              onClick={() => onSelect(app)}
            >
              {app.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="app-picker-empty">No apps found</div>
          )}
        </div>
      </div>
    </div>
  );
}
