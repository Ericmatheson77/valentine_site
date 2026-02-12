import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Heart, CalendarHeart, Loader2, Images, X } from "lucide-react";
import CountdownTimer from "./components/CountdownTimer";
import MemoryCard, { formatMemoryDate } from "./components/MemoryCard";
import CardBack from "./components/CardBack";
import Gallery from "./components/Gallery";
import { fetchMemories, getToday } from "./data";
import type { MemoryEntry } from "./types";

// Normalize any S3 URLs so that each path segment is encoded but "/" is preserved.
// This fixes older records where the whole key was encodeURIComponent'ed
// (turning "/" into "%2F"), which breaks S3 paths and can look like CORS errors.
function normalizeS3Url(url: string): string {
  try {
    const match = url.match(/^(https:\/\/[^/]+\/)(.+)$/);
    if (!match) return url;
    const [, base, path] = match;
    if (!path.includes("%2F")) return url;
    const decodedPath = decodeURIComponent(path);
    const reencoded = decodedPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return base + reencoded;
  } catch {
    return url;
  }
}

function normalizeMediaList(urls: string[] | undefined | null): string[] {
  if (!urls || urls.length === 0) return [];
  return urls.map(normalizeS3Url);
}

function App() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaModal, setMediaModal] = useState<{
    open: boolean;
    date: string | null;
    urls: string[];
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    date: null,
    urls: [],
    loading: false,
    error: null,
  });
  const today = getToday();
  // "Story" timeline date: exactly one year ago from today.
  // This controls which day's memory is considered "today's" in the app.
  const timelineToday = (() => {
    const d = new Date(today + "T00:00:00");
    d.setFullYear(d.getFullYear() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  })();

  useEffect(() => {
    fetchMemories()
      .then((data) => {
        // Normalize any legacy S3 URLs stored in Dynamo so they always have
        // proper path encoding.
        const normalized = data.map((m) => ({
          ...m,
          media: normalizeMediaList(m.media),
        }));
        setMemories(normalized);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Could not load memories. Please try again later.");
        setLoading(false);
      });
  }, []);

  const allMemories = [...memories].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const todayMemory = allMemories.find((m) => m.date === timelineToday);
  const pastMemories = allMemories.filter((m) => m.date < timelineToday);

  const openMediaModalForDate = async (date: string, initialUrls: string[] = []) => {
    const normalizedInitial = normalizeMediaList(initialUrls);

    setMediaModal({
      open: true,
      date,
      urls: normalizedInitial,
      loading: true,
      error: null,
    });

    try {
      const res = await fetch(`/api/date-media?date=${encodeURIComponent(date)}`);
      if (!res.ok) throw new Error("Failed to load media");
      const data: { date: string; urls: string[] } = await res.json();
      const normalizedFromApi = normalizeMediaList(data.urls);

      setMediaModal((prev) => ({
        ...prev,
        urls: [
          ...normalizedInitial,
          ...normalizedFromApi.filter((u) => !normalizedInitial.includes(u)),
        ],
        loading: false,
      }));
    } catch (e) {
      console.error(e);
      setMediaModal((prev) => ({
        ...prev,
        loading: false,
        error: "Could not load all media for this day.",
      }));
    }
  };

  const closeMediaModal = () =>
    setMediaModal({
      open: false,
      date: null,
      urls: [],
      loading: false,
      error: null,
    });

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 via-pink-50/30 to-cream">
      <CountdownTimer targetDate="2026-05-29" label="Forever" />

      {/* Floating hearts background decoration */}
      <FloatingHearts />

      <main className="relative z-10 flex flex-col items-center px-4 pt-20 pb-16">
        {/* Today's Card Section */}
        <section className="w-full max-w-sm mx-auto mt-6 mb-10">
          <motion.div
            className="flex flex-col items-center justify-center gap-1 mb-5"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center justify-center gap-2">
              <CalendarHeart className="w-5 h-5 text-rose-400" />
              <h2 className="font-display text-xl text-rose-600 font-semibold">
                Today's Memory
              </h2>
            </div>
            <p className="text-xs text-rose-400">
              {new Date(timelineToday + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex justify-center"
          >
            {loading ? (
              <LoadingCard />
            ) : error ? (
              <ErrorCard message={error} />
            ) : todayMemory ? (
              <div className="flex flex-col items-center gap-3">
                <MemoryCard entry={todayMemory} />
                <ViewAllMediaButton
                  onClick={() =>
                    openMediaModalForDate(
                      todayMemory.date,
                      todayMemory.media || []
                    )
                  }
                />
              </div>
            ) : (
              <NoMemoryToday />
            )}
          </motion.div>
        </section>

        {/* Past Memories Section */}
        {!loading && pastMemories.length > 0 && (
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
                <PastMemoryCard
                  key={memory.date}
                  memory={memory}
                  onViewAll={() =>
                    openMediaModalForDate(memory.date, memory.media || [])
                  }
                />
              ))}
            </div>
          </section>
        )}

      </main>

      {mediaModal.open && mediaModal.date && (
        <MediaModal
          date={mediaModal.date}
          urls={mediaModal.urls}
          loading={mediaModal.loading}
          error={mediaModal.error}
          onClose={closeMediaModal}
        />
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="w-full max-w-sm aspect-[3/4] flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg shadow-rose-100/40 p-8 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 className="w-10 h-10 text-rose-300 mb-4" />
      </motion.div>
      <p className="text-sm text-rose-400 font-medium">
        Loading your memories...
      </p>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="w-full max-w-sm aspect-[3/4] flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm rounded-2xl shadow-lg shadow-rose-100/40 p-8 text-center">
      <Heart className="w-10 h-10 text-rose-300 mb-4" />
      <p className="font-display text-lg text-rose-500 font-semibold mb-2">
        Oops!
      </p>
      <p className="text-sm text-rose-400">{message}</p>
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

function PastMemoryCard({
  memory,
  onViewAll,
}: {
  memory: MemoryEntry;
  onViewAll: () => void;
}) {
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
      <div className="flex flex-col items-center gap-2">
        <div className="w-full max-w-[200px] aspect-[3/4]">
          <CardBack entry={memory} compact />
        </div>
        <ViewAllMediaButton onClick={onViewAll} small />
      </div>
    </motion.div>
  );
}

function ViewAllMediaButton({
  onClick,
  small = false,
}: {
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-rose-200 text-rose-500 bg-white/70 backdrop-blur px-3 ${
        small ? "py-1 text-[11px]" : "py-1.5 text-xs"
      } shadow-sm hover:bg-rose-50 transition-colors`}
    >
      <Images className={small ? "w-3.5 h-3.5" : "w-4 h-4"} />
      <span>View all from this day</span>
    </button>
  );
}

function MediaModal({
  date,
  urls,
  loading,
  error,
  onClose,
}: {
  date: string;
  urls: string[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <p className="text-white/90 text-sm font-medium text-center">
          All moments from <span className="font-semibold">{formattedDate}</span>
        </p>

        <div className="w-full max-w-[320px] aspect-[3/4] bg-white/10 rounded-2xl flex items-center justify-center">
          {error ? (
            <p className="text-xs text-red-100 text-center px-4">{error}</p>
          ) : urls.length === 0 ? (
            loading ? (
              <div className="flex flex-col items-center justify-center gap-3 text-white/80">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">Loading media...</span>
              </div>
            ) : (
              <p className="text-xs text-white/80 text-center px-4">
                There are no media items for this day yet.
              </p>
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 w-full h-full px-2">
              <Gallery images={urls} compact />
              {loading && (
                <p className="text-[10px] text-white/70 mt-1">
                  Loading more moments from this day...
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
