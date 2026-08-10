import type { AppConfig } from "../types";
import { AppGlyph } from "./Glyphs";

interface SlotItemProps {
  index: number;
  app: AppConfig | null;
  iconDataUri?: string;
  onClick: () => void;
}

export default function SlotItem({ index, app, iconDataUri, onClick }: SlotItemProps) {
  return (
    <button
      className={`slot-item ${app ? "assigned" : "empty"}`}
      onClick={onClick}
    >
      <span className="slot-number">{index + 1}</span>
      <span className="slot-media">
        {iconDataUri ? (
          <img className="slot-icon" src={iconDataUri} alt="" draggable={false} />
        ) : (
          <AppGlyph />
        )}
      </span>
      <span className="slot-app-name">{app ? app.name : "Assign app..."}</span>
      <span className="slot-shortcut">&#x2325;{index + 1}</span>
    </button>
  );
}
