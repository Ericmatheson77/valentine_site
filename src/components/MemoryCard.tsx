import { useState } from "react";
import { motion } from "framer-motion";
import type { MemoryEntry } from "../types";
import { getToday } from "../data";
import CardFront from "./CardFront";
import CardBack from "./CardBack";
import LockedDay from "./LockedDay";

interface MemoryCardProps {
  entry: MemoryEntry;
  compact?: boolean;
}

export default function MemoryCard({ entry, compact = false }: MemoryCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const today = getToday();
  const isFuture = entry.date > today;

  // If the date is in the future, show locked state (non-interactive)
  if (isFuture) {
    return (
      <div
        className={`${
          compact ? "w-full max-w-[200px]" : "w-full max-w-sm"
        } aspect-[3/4] cursor-not-allowed`}
      >
        <LockedDay date={entry.date} />
      </div>
    );
  }

  const handleFlip = () => {
    if (!isFlipped) {
      setIsFlipped(true);
    }
  };

  return (
    <div
      className={`perspective-1000 ${
        compact ? "w-full max-w-[200px]" : "w-full max-w-sm"
      } aspect-[3/4]`}
      onClick={handleFlip}
    >
      <motion.div
        className="relative w-full h-full preserve-3d cursor-pointer"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      >
        {/* Front face */}
        <div className="absolute inset-0 backface-hidden">
          <CardFront />
        </div>

        {/* Back face (pre-rotated 180deg so it's readable when flipped) */}
        <div
          className="absolute inset-0 backface-hidden"
          style={{ transform: "rotateY(180deg)" }}
        >
          <CardBack entry={entry} compact={compact} />
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Formats a date string to a friendly display
 */
export function formatMemoryDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
