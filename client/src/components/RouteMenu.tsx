import { useEffect } from "react";
import type { RouteMenuItem } from "../hooks/useRouteMenu";
import { useMouseRejection } from "../hooks/useMouseRejection";

interface RouteMenuProps {
  items: RouteMenuItem[];
  selected: number;
  onSelect: (index: number) => void;
  onActivate: (index: number) => void;
  onClose: () => void;
}

export default function RouteMenu({
  items,
  selected,
  onSelect,
  onActivate,
  onClose,
}: RouteMenuProps) {
  const { acceptHover, disarmHover } = useMouseRejection();

  useEffect(disarmHover, [selected, disarmHover]);

  return (
    <>
      <div className="route-menu-scrim" onClick={onClose} />
      <div className="route-menu" role="menu">
        {items.map((item, i) => (
          <button
            key={item.keycap}
            className="route-menu-item"
            role="menuitem"
            data-selected={i === selected}
            onMouseMove={(e) => {
              if (acceptHover(e)) onSelect(i);
            }}
            onClick={() => onActivate(i)}
          >
            <span className="route-keycap">{item.keycap}</span>
            <span className="route-menu-text">
              <span className="route-menu-label">{item.label}</span>
              <span className="route-menu-caption">{item.caption}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
