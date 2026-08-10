import type { ResultRow } from "../types";
import { AppGlyph, CommandGlyph, ShellGlyph } from "./Glyphs";

interface ResultItemProps {
  row: ResultRow;
  selected: boolean;
  /** PNG data URI for `row.iconPath`, once it has loaded. */
  icon?: string;
  onHover: () => void;
  onActivate: () => void;
}

/** Bold the fuzzy-matched characters in the title. */
function highlight(title: string, indices?: number[]) {
  if (!indices || indices.length === 0) return title;
  const set = new Set(indices);
  return [...title].map((ch, i) =>
    set.has(i) ? (
      <mark key={i} className="hl">
        {ch}
      </mark>
    ) : (
      <span key={i}>{ch}</span>
    ),
  );
}

/**
 * Leading visual: a real app icon where we have one, otherwise a shape that reads at the
 * same size — a glyph for the synthetic rows, a monogram for an app we couldn't rasterize.
 */
function Media({ row, icon }: { row: ResultRow; icon?: string }) {
  if (icon) {
    return (
      <span className="result-media" data-media="icon">
        <img className="result-icon" src={icon} alt="" draggable={false} />
      </span>
    );
  }
  if (row.badge) {
    return (
      <span className="result-media" data-media="badge">
        {row.badge}
      </span>
    );
  }
  if (row.kind === "command") {
    return (
      <span className="result-media" data-media="glyph">
        <CommandGlyph />
      </span>
    );
  }
  if (row.kind === "shell") {
    return (
      <span className="result-media" data-media="glyph">
        <ShellGlyph />
      </span>
    );
  }
  const initial = [...row.title.trim()][0];
  return (
    <span className="result-media" data-media={initial ? "monogram" : "glyph"}>
      {initial ? initial.toUpperCase() : <AppGlyph />}
    </span>
  );
}

export default function ResultItem({
  row,
  selected,
  icon,
  onHover,
  onActivate,
}: ResultItemProps) {
  return (
    <button
      className={`result-item ${selected ? "selected" : ""}`}
      data-kind={row.kind}
      data-status={row.status ?? ""}
      onMouseMove={onHover}
      onClick={onActivate}
    >
      <Media row={row} icon={icon} />
      <span className="result-text">
        <span className="result-title">{highlight(row.title, row.matchIndices)}</span>
        {row.subtitle && <span className="result-subtitle">{row.subtitle}</span>}
      </span>
      <span className="result-enter">
        {row.status ? (
          <span className="kill-orb" data-status={row.status} aria-hidden />
        ) : selected && row.onKill ? (
          <span className="kill-hint">
            <kbd>⇧⌫</kbd>
          </span>
        ) : selected ? (
          "↵"
        ) : (
          ""
        )}
      </span>
    </button>
  );
}
