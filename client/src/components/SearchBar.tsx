import { forwardRef } from "react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Whether we're in an agent context (`?` menu or `?xx` run) — drives the AI animation. */
  aiActive: boolean;
  /** When set, shows a chip naming the chosen agent. */
  agentLabel?: string;
  onOpenSettings: () => void;
}

const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, onKeyDown, aiActive, agentLabel, onOpenSettings }, ref) => {
    return (
      <div className="search-bar" data-agent={aiActive ? "true" : "false"}>
        <span className="search-glyph" aria-hidden>
          {aiActive ? (
            <span className="ai-orb" />
          ) : (
            "⌕"
          )}
        </span>
        {agentLabel && <span className="agent-chip">{agentLabel}</span>}
        <input
          ref={ref}
          className="search-input"
          type="text"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder={
            agentLabel
              ? "describe the task…"
              : "Search apps · ? agents · > commands"
          }
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
