import { useState, useEffect, useRef } from "react";
import type { AppInfo } from "../types";
import { AppGlyph } from "./Glyphs";

interface AppPickerProps {
  apps: AppInfo[];
  slotIndex: number;
  /** Bundle path → PNG data URI. */
  icons: Record<string, string>;
  /** Loads icons for the paths currently on screen. */
  requestIcons: (paths: string[]) => void;
  onSelect: (app: AppInfo | null) => void;
  onClose: () => void;
}

/** How far down the filtered list we pre-load icons — enough to cover the scroll viewport. */
const ICON_LOOKAHEAD = 24;

export default function AppPicker({
  apps,
  slotIndex,
  icons,
  requestIcons,
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

  const lookahead = filtered
    .slice(0, ICON_LOOKAHEAD)
    .map((app) => app.path)
    .join("\u0000");
  useEffect(() => {
    if (lookahead) requestIcons(lookahead.split("\u0000"));
  }, [lookahead, requestIcons]);

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
              <span className="app-picker-media">
                {icons[app.path] ? (
                  <img
                    className="app-picker-icon"
                    src={icons[app.path]}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <AppGlyph size={14} />
                )}
              </span>
              <span className="app-picker-name">{app.name}</span>
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
