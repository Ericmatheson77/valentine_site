import { Lock } from "lucide-react";
import { motion } from "framer-motion";

interface LockedDayProps {
  date: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function LockedDay({ date }: LockedDayProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-gray-50 to-rose-50 rounded-2xl p-8 select-none opacity-80">
      <motion.div
        className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center shadow-md"
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Lock className="w-7 h-7 text-rose-300" />
      </motion.div>

      <div className="text-center space-y-1">
        <p className="font-display text-lg text-rose-400 font-semibold">
          No Peeking!
        </p>
        <p className="text-xs text-rose-300 font-medium">
          Come back on {formatDate(date)}
        </p>
      </div>
    </div>
  );
}
