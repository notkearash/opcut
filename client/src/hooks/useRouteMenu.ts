import { useCallback, useState } from "react";

export interface RouteMenuItem {
  keycap: string;
  label: string;
  caption: string;
  onActivate: () => void;
}

export interface RouteMenu {
  open: boolean;
  selected: number;
  setSelected: (index: number) => void;
  toggle: () => void;
  close: () => void;
  activate: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

export function useRouteMenu(items: RouteMenuItem[]): RouteMenu {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);

  const close = useCallback(() => setOpen(false), []);

  const toggle = useCallback(() => {
    setSelected(0);
    setOpen((wasOpen) => !wasOpen);
  }, []);

  const activate = useCallback(
    (index: number) => {
      setOpen(false);
      items[index]?.onActivate();
    },
    [items],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, items.length - 1));
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
        return true;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        activate(selected);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return true;
      }
      setOpen(false);
      return false;
    },
    [open, items, selected, activate],
  );

  return { open, selected, setSelected, toggle, close, activate, handleKeyDown };
}
