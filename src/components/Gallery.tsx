import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface GalleryProps {
  images: string[];
  caption?: string;
  compact?: boolean;
}

const swipeConfidenceThreshold = 50;

// Match CardBack logic – infer videos by extension
function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".webm");
}

export default function Gallery({ images, caption, compact = false }: GalleryProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const touchStartX = useRef(0);

  const paginate = (dir: number) => {
    setDirection(dir);
    setCurrent((prev) => {
      const next = prev + dir;
      if (next < 0) return images.length - 1;
      if (next >= images.length) return 0;
      return next;
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > swipeConfidenceThreshold) {
      paginate(diff > 0 ? 1 : -1);
    }
  };

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 200 : -200,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -200 : 200,
      opacity: 0,
    }),
  };

  if (images.length === 0) return null;

  const currentUrl = images[current];
  const isVideo = isVideoUrl(currentUrl);

  return (
    <div className={`w-full flex flex-col items-center ${compact ? "gap-1.5" : "gap-3"}`}>
      {/* Media container */}
      <div
        className="relative w-full aspect-[3/4] overflow-hidden rounded-xl bg-white shadow-inner"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={current}
            className="absolute inset-0 w-full h-full flex items-center justify-center"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {isVideo ? (
              <video
                src={currentUrl}
                className="max-h-full max-w-full w-auto h-auto object-contain"
                controls
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                src={currentUrl}
                alt={`Memory media ${current + 1}`}
                className="max-h-full max-w-full w-auto h-auto object-contain"
                draggable={false}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows (visible on hover / larger screens, hidden in compact) */}
        {images.length > 1 && !compact && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                paginate(-1);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 hover:opacity-100 transition-opacity md:opacity-60"
              aria-label="Previous media"
            >
              <ChevronLeft className="w-4 h-4 text-rose-500" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                paginate(1);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 hover:opacity-100 transition-opacity md:opacity-60"
              aria-label="Next media"
            >
              <ChevronRight className="w-4 h-4 text-rose-500" />
            </button>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {images.length > 1 && (
        <div className={`flex ${compact ? "gap-1" : "gap-1.5"}`}>
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setDirection(i > current ? 1 : -1);
                setCurrent(i);
              }}
              className={`rounded-full transition-all duration-300 ${
                compact ? "w-1.5 h-1.5" : "w-2 h-2"
              } ${
                i === current
                  ? `bg-rose-400 ${compact ? "w-2.5" : "w-4"}`
                  : "bg-rose-200 hover:bg-rose-300"
              }`}
              aria-label={`Go to media ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Caption */}
      {caption && <GalleryCaption caption={caption} compact={compact} />}
    </div>
  );
}

function GalleryCaption({
  caption,
  compact,
}: {
  caption: string;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (compact) {
    return (
      <p className="text-rose-500/80 text-center font-medium italic px-1 text-[10px] line-clamp-2">
        {caption}
      </p>
    );
  }

  const shouldShowToggle = caption.length > 140;

  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <p
        className={`text-rose-500/80 text-center font-medium italic text-sm whitespace-pre-line ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {caption}
      </p>
      {shouldShowToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-rose-400 hover:text-rose-500 font-medium underline-offset-2 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
