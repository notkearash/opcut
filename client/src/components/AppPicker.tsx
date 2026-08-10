import { useState, useEffect, useRef } from "react";
import type { AppInfo } from "../types";
import { joinIconPaths, splitIconPaths } from "../lib/iconPaths";
import { AppGlyph } from "./Glyphs";

interface AppPickerProps {
  apps: AppInfo[];
  slotIndex: number;
  iconsByBundlePath: Record<string, string>;
  requestIcons: (paths: string[]) => void;
  onSelect: (app: AppInfo | null) => void;
  onClose: () => void;
}

const ROWS_PRELOADED_BEYOND_VIEWPORT = 24;

export default function AppPicker({
  apps,
  slotIndex,
  iconsByBundlePath,
  requestIcons,
  onSelect,
  onClose,
}: AppPickerProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matchingApps = apps.filter((app) =>
    app.name.toLowerCase().includes(search.toLowerCase()),
  );

  const iconPathsToLoad = joinIconPaths(
    matchingApps.slice(0, ROWS_PRELOADED_BEYOND_VIEWPORT).map((app) => app.path),
  );
  useEffect(() => {
    if (iconPathsToLoad) requestIcons(splitIconPaths(iconPathsToLoad));
  }, [iconPathsToLoad, requestIcons]);

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
              if (matchingApps.length > 0) onSelect(matchingApps[0]);
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
          {matchingApps.map((app) => (
            <button
              key={app.path}
              className="app-picker-item"
              onClick={() => onSelect(app)}
            >
              <span className="app-picker-media">
                {iconsByBundlePath[app.path] ? (
                  <img
                    className="app-picker-icon"
                    src={iconsByBundlePath[app.path]}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <AppGlyph />
                )}
              </span>
              <span className="app-picker-name">{app.name}</span>
            </button>
          ))}
          {matchingApps.length === 0 && (
            <div className="app-picker-empty">No apps found</div>
          )}
        </div>
      </div>
    </div>
  );
}
