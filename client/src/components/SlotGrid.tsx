import type { AppConfig } from "../types";
import SlotItem from "./SlotItem";

interface SlotGridProps {
  slots: (AppConfig | null)[];
  iconsByBundlePath: Record<string, string>;
  onSlotClick: (index: number) => void;
}

export default function SlotGrid({ slots, iconsByBundlePath, onSlotClick }: SlotGridProps) {
  return (
    <div className="slot-grid">
      {slots.map((app, i) => (
        <SlotItem
          key={i}
          index={i}
          app={app}
          iconDataUri={app ? iconsByBundlePath[app.path] : undefined}
          onClick={() => onSlotClick(i)}
        />
      ))}
    </div>
  );
}
