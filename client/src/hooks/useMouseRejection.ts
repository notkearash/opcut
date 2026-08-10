import { useCallback, useRef } from "react";

export function useMouseRejection() {
  const lastCursorPosition = useRef<{ x: number; y: number } | null>(null);

  const disarmHover = useCallback(() => {
    lastCursorPosition.current = null;
  }, []);

  const acceptHover = useCallback((e: React.MouseEvent) => {
    const { screenX: x, screenY: y } = e;
    const previous = lastCursorPosition.current;
    lastCursorPosition.current = { x, y };
    const cursorActuallyTravelled =
      previous !== null && (previous.x !== x || previous.y !== y);
    return cursorActuallyTravelled;
  }, []);

  return { acceptHover, disarmHover };
}
