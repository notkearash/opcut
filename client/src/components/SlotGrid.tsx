import type { AppConfig } from "../types";
import SlotItem from "./SlotItem";

interface SlotGridProps {
  slots: (AppConfig | null)[];
  onSlotClick: (index: number) => void;
}

export default function SlotGrid({ slots, onSlotClick }: SlotGridProps) {
  return (
    <div className="slot-grid">
      {slots.map((app, i) => (
        <SlotItem key={i} index={i} app={app} onClick={() => onSlotClick(i)} />
      ))}
    </div>
  );
}
