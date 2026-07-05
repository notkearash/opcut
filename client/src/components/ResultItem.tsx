import type { ResultRow } from "../types";

interface ResultItemProps {
  row: ResultRow;
  selected: boolean;
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

export default function ResultItem({
  row,
  selected,
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
      {row.badge && <span className="result-badge">{row.badge}</span>}
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
