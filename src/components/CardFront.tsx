import { Gift, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function CardFront() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-rose-100 via-pink-50 to-cream rounded-2xl p-8 select-none shadow-lg shadow-rose-200/40 border border-rose-100/50">
      {/* Decorative sparkles */}
      <motion.div
        animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles className="w-6 h-6 text-rose-300" />
      </motion.div>

      {/* Gift icon with pulse */}
      <motion.div
        className="w-20 h-20 rounded-full bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-rose-200/50"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Gift className="w-10 h-10 text-rose-400" />
      </motion.div>

      {/* Text */}
      <div className="text-center space-y-1.5">
        <p className="font-display text-xl text-rose-600 font-semibold">
          A Little Surprise
        </p>
        <p className="text-sm text-rose-400 font-medium">Tap to unwrap</p>
      </div>

      {/* Decorative dots */}
      <div className="flex gap-1.5 mt-2">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-rose-300"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
