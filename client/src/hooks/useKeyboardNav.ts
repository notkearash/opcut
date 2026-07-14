import { useCallback, useState } from "react";
import type { ResultRow } from "../types";

interface NavResult {
  selected: number;
  setSelected: React.Dispatch<React.SetStateAction<number>>;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Arrow/Enter/Escape navigation over the current result list. Selection resets to 0
 * whenever the result set changes. The caller owns Escape (hide window) via `onEscape`.
 * `suspendSelectionReset` keeps the selection across result-set changes — the ⌥Tab
 * switcher cycles a selection the user isn't typing to filter, and the async
 * running-app refresh must not yank it back to 0.
 */
export function useKeyboardNav(
  results: ResultRow[],
  onEscape: () => void,
  suspendSelectionReset = false,
): NavResult {
  const [selected, setSelected] = useState(0);
  // Reset selection when the result set identity changes (React's recommended
  // "adjust state during render" pattern — no effect, no cascading render).
  const [prevResults, setPrevResults] = useState(results);
  if (prevResults !== results) {
    setPrevResults(results);
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
