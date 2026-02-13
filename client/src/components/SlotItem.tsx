import type { AppConfig } from "../types";

interface SlotItemProps {
  index: number;
  app: AppConfig | null;
  onClick: () => void;
}

export default function SlotItem({ index, app, onClick }: SlotItemProps) {
  return (
    <button
      className={`slot-item ${app ? "assigned" : "empty"}`}
      onClick={onClick}
    >
      <span className="slot-number">{index + 1}</span>
      <span className="slot-app-name">{app ? app.name : "Assign app..."}</span>
      <span className="slot-shortcut">&#x2325;{index + 1}</span>
    </button>
  );
}
