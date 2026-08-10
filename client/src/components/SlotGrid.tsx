import type { AppConfig } from "../types";
import SlotItem from "./SlotItem";

interface SlotGridProps {
  slots: (AppConfig | null)[];
  /** Bundle path → PNG data URI. */
  icons: Record<string, string>;
  onSlotClick: (index: number) => void;
}

export default function SlotGrid({ slots, icons, onSlotClick }: SlotGridProps) {
  return (
    <div className="slot-grid">
      {slots.map((app, i) => (
        <SlotItem
          key={i}
          index={i}
          app={app}
          icon={app ? icons[app.path] : undefined}
          onClick={() => onSlotClick(i)}
        />
      ))}
    </div>
  );
}
