import { forwardRef } from "react";
import { SearchGlyph, ShellGlyph } from "./Glyphs";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Whether we're in shell mode (`!` prefix) — swaps the glyph for a shell prompt. */
  shellActive: boolean;
  onOpenSettings: () => void;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, onKeyDown, shellActive, onOpenSettings }, ref) => {
    return (
      <div className="search-bar" data-shell={shellActive ? "true" : "false"}>
        <span className="search-glyph" aria-hidden>
          {shellActive ? <ShellGlyph /> : <SearchGlyph />}
        </span>
        <input
          ref={ref}
          className="search-input"
          type="text"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder="Search · / open · > commands · ! shell"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          className="settings-btn"
          title="Configure quick slots"
          tabIndex={-1}
          onClick={onOpenSettings}
        >
          ⌥
        </button>
      </div>
    );
  },
);

SearchBar.displayName = "SearchBar";
export default SearchBar;
