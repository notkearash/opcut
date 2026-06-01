import { useEffect, useRef } from "react";
import type { ResultRow } from "../types";
import ResultItem from "./ResultItem";

interface ResultListProps {
  rows: ResultRow[];
  selected: number;
  onHover: (i: number) => void;
}

export default function ResultList({ rows, selected, onHover }: ResultListProps) {
  const selectedRef = useRef<HTMLDivElement>(null);

  // Keep the selected row in view during keyboard navigation.
  useEffect(() => {
    selectedRef.current
      ?.querySelector(".selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="result-list" ref={selectedRef}>
      {rows.map((row, i) => (
        <ResultItem
          key={row.id}
          row={row}
          selected={i === selected}
          onHover={() => onHover(i)}
          onActivate={row.onActivate}
        />
      ))}
    </div>
  );
}
