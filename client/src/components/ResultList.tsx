import { useEffect, useRef } from "react";
import type { ResultRow } from "../types";
import ResultItem from "./ResultItem";

interface ResultListProps {
  rows: ResultRow[];
  selected: number;
  iconsByBundlePath: Record<string, string>;
  onHover: (i: number, e: React.MouseEvent) => void;
}

export default function ResultList({
  rows,
  selected,
  iconsByBundlePath,
  onHover,
}: ResultListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="result-list" ref={listRef}>
      {rows.map((row, i) => (
        <ResultItem
          key={row.id}
          row={row}
          selected={i === selected}
          iconDataUri={
            row.iconBundlePath ? iconsByBundlePath[row.iconBundlePath] : undefined
          }
          onHover={(e) => onHover(i, e)}
          onActivate={row.onActivate}
        />
      ))}
    </div>
  );
}
