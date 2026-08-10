import type { ResultRow } from "../types";
import { AppGlyph, CommandGlyph, ShellGlyph } from "./Glyphs";

interface ResultItemProps {
  row: ResultRow;
  selected: boolean;
  iconDataUri?: string;
  onHover: (e: React.MouseEvent) => void;
  onActivate: () => void;
}

function highlightMatchedChars(title: string, matchedIndices?: number[]) {
  if (!matchedIndices || matchedIndices.length === 0) return title;
  const matched = new Set(matchedIndices);
  return [...title].map((ch, i) =>
    matched.has(i) ? (
      <mark key={i} className="hl">
        {ch}
      </mark>
    ) : (
      <span key={i}>{ch}</span>
    ),
  );
}

function Media({ row, iconDataUri }: { row: ResultRow; iconDataUri?: string }) {
  if (iconDataUri) {
    return (
      <span className="result-media" data-media="icon">
        <img className="result-icon" src={iconDataUri} alt="" draggable={false} />
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
  const monogram = [...row.title.trim()][0];
  return (
    <span className="result-media" data-media={monogram ? "monogram" : "glyph"}>
      {monogram ? monogram.toUpperCase() : <AppGlyph />}
    </span>
  );
}

export default function ResultItem({
  row,
  selected,
  iconDataUri,
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
      <Media row={row} iconDataUri={iconDataUri} />
      <span className="result-text">
        <span className="result-title">
          {highlightMatchedChars(row.title, row.matchIndicesInTitle)}
        </span>
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
