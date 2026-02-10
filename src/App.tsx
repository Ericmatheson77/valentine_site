import { motion } from "framer-motion";
import { Heart, CalendarHeart } from "lucide-react";
import CountdownTimer from "./components/CountdownTimer";
import MemoryCard, { formatMemoryDate } from "./components/MemoryCard";
import { getTodayMemory, getAllMemories, getToday } from "./data";
import type { MemoryEntry } from "./types";

function App() {
  const todayMemory = getTodayMemory();
  const allMemories = getAllMemories();
  const today = getToday();

  // Past memories (excluding today's)
  const pastMemories = allMemories.filter(
    (m) => m.date < today
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/30 to-cream">
      <CountdownTimer targetDate="2026-05-29" label="Forever" />

      {/* Floating hearts background decoration */}
      <FloatingHearts />

      <main className="relative z-10 flex flex-col items-center px-4 pt-20 pb-16">
        {/* Today's Card Section */}
        <section className="w-full max-w-sm mx-auto mt-6 mb-10">
          <motion.div
            className="flex items-center justify-center gap-2 mb-5"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <CalendarHeart className="w-5 h-5 text-rose-400" />
            <h2 className="font-display text-xl text-rose-600 font-semibold">
              Today's Memory
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex justify-center"
          >
            {todayMemory ? (
              <MemoryCard entry={todayMemory} />
            ) : (
              <NoMemoryToday />
            )}
          </motion.div>
        </section>

        {/* Past Memories Section */}
        {pastMemories.length > 0 && (
          <section className="w-full max-w-lg mx-auto">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Heart className="w-4 h-4 text-rose-300 fill-rose-300" />
              <h3 className="font-display text-lg text-rose-500 font-medium">
                Past Memories
              </h3>
              <Heart className="w-4 h-4 text-rose-300 fill-rose-300" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {pastMemories.map((memory) => (
                <PastMemoryCard key={memory.date} memory={memory} />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming locked days preview */}
        <UpcomingDays memories={allMemories} today={today} />
      </main>
    </div>
  );
}

function NoMemoryToday() {
  return (
    <div className="w-full max-w-sm aspect-[3/4] flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg shadow-rose-100/40 p-8 text-center">
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Heart className="w-12 h-12 text-rose-300 fill-rose-200 mb-4" />
      </motion.div>
      <p className="font-display text-lg text-rose-500 font-semibold mb-2">
        Come Back Tomorrow
      </p>
      <p className="text-sm text-rose-400">
        A new surprise is waiting for you!
      </p>
    </div>
  );
}

function PastMemoryCard({ memory }: { memory: MemoryEntry }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-1.5 text-center">
        <span className="text-[11px] font-medium text-rose-400 uppercase tracking-wider">
          {formatMemoryDate(memory.date)}
        </span>
      </div>
      <MemoryCard entry={memory} compact />
    </motion.div>
  );
}

function UpcomingDays({
  memories,
  today,
}: {
  memories: MemoryEntry[];
  today: string;
}) {
  const upcoming = memories.filter((m) => m.date > today).slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <section className="w-full max-w-lg mx-auto mt-10">
      <div className="flex items-center justify-center gap-2 mb-4">
        <h3 className="font-display text-lg text-rose-400 font-medium">
          Coming Soon
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {upcoming.map((memory) => (
          <div key={memory.date} className="aspect-[3/4]">
            <MemoryCard entry={memory} compact />
          </div>
        ))}
      </div>
    </section>
  );
}

function FloatingHearts() {
  const hearts = Array.from({ length: 6 }, (_, i) => i);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {hearts.map((i) => (
        <motion.div
          key={i}
          className="absolute text-rose-200/30"
          style={{
            left: `${15 + i * 14}%`,
            top: `${10 + (i % 3) * 25}%`,
          }}
          animate={{
            y: [0, -20, 0],
            rotate: [0, 10, -10, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 4 + i * 0.5,
            repeat: Infinity,
            delay: i * 0.7,
            ease: "easeInOut",
          }}
        >
          <Heart
            className="fill-current"
            style={{
              width: `${16 + i * 4}px`,
              height: `${16 + i * 4}px`,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

export default App;
