import { forwardRef } from "react";
import { SearchGlyph, ShellGlyph } from "./Glyphs";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  shellActive: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, onKeyDown, shellActive, menuOpen, onToggleMenu }, ref) => {
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
          title="Show modes"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          data-open={menuOpen}
          tabIndex={-1}
          onClick={onToggleMenu}
        >
          ⌥
        </button>
      </div>
    );
  },
);

SearchBar.displayName = "SearchBar";
export default SearchBar;
