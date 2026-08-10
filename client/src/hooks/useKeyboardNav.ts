import { useCallback, useState } from "react";
import type { ResultRow } from "../types";

interface NavResult {
  selected: number;
  setSelected: React.Dispatch<React.SetStateAction<number>>;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function useKeyboardNav(
  results: ResultRow[],
  onEscape: () => void,
  suspendSelectionReset = false,
): NavResult {
  const [selected, setSelected] = useState(0);
  const [renderedResults, setRenderedResults] = useState(results);
  const resultSetChanged = renderedResults !== results;
  if (resultSetChanged) {
    setRenderedResults(results);
    if (!suspendSelectionReset) setSelected(0);
  }

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        results[selected]?.onActivate();
      } else if (
        e.shiftKey &&
        (e.key === "Delete" || e.key === "Backspace") &&
        results[selected]?.onKill
      ) {
        e.preventDefault();
        results[selected].onKill?.();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      }
    },
    [results, selected, onEscape],
  );

  return { selected, setSelected, onKeyDown };
}
