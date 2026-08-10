import type { AppConfig } from "../types";
import { AppGlyph } from "./Glyphs";

interface SlotItemProps {
  index: number;
  app: AppConfig | null;
  /** PNG data URI for the assigned app, when loaded. */
  icon?: string;
  onClick: () => void;
}

export default function SlotItem({ index, app, icon, onClick }: SlotItemProps) {
  return (
    <button
      className={`slot-item ${app ? "assigned" : "empty"}`}
      onClick={onClick}
    >
      <span className="slot-number">{index + 1}</span>
      <span className="slot-media">
        {icon ? (
          <img className="slot-icon" src={icon} alt="" draggable={false} />
        ) : (
          <AppGlyph />
        )}
      </span>
      <span className="slot-app-name">{app ? app.name : "Assign app..."}</span>
      <span className="slot-shortcut">&#x2325;{index + 1}</span>
    </button>
  );
}
