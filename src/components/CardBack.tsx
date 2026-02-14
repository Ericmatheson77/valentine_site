import { useEffect, useRef, useState } from "react";
import type { MemoryEntry } from "../types";
import Gallery from "./Gallery";
import { Quote } from "lucide-react";

interface CardBackProps {
  entry: MemoryEntry;
  compact?: boolean;
}

// Very small helper – we infer videos by file extension
function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".webm");
}

export default function CardBack({ entry, compact = false }: CardBackProps) {
  const isText = entry.type === "text";

  return (
    <div
      className="w-full h-full bg-white rounded-2xl p-4 flex flex-col items-center justify-start overflow-y-auto overflow-x-hidden min-h-0 shadow-lg shadow-rose-200/40 border border-rose-100/50"
    >
      {isText && <TextContent text={entry.text} compact={compact} />}
      {entry.type === "photo" && (
        <PhotoContent
          mediaUrl={entry.media?.[0] || ""}
          caption={entry.text}
          compact={compact}
        />
      )}
      {entry.type === "gallery" && (
        <Gallery
          images={entry.media || []}
          caption={entry.text}
          compact={compact}
        />
      )}
    </div>
  );
}

function TextContent({ text, compact }: { text: string; compact: boolean }) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-2 py-3 text-center overflow-hidden">
        <p className="font-display leading-relaxed text-rose-700 italic text-xs line-clamp-6">
          {text}
        </p>
      </div>
    );
  }

  // Full-size card: allow long romantic letters/poems with scrolling
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-3 py-4 text-center max-h-full overflow-y-auto">
      <Quote className="w-6 h-6 text-rose-200 rotate-180 shrink-0" />
      <p className="font-display leading-relaxed text-rose-700 italic text-base whitespace-pre-line">
        {text}
      </p>
      <Quote className="w-6 h-6 text-rose-200 shrink-0" />
    </div>
  );
}

function PhotoContent({
  mediaUrl,
  caption,
  compact,
}: {
  mediaUrl: string;
  caption: string;
  compact: boolean;
}) {
  const isVideo = isVideoUrl(mediaUrl);

  return (
    <div className="flex flex-col items-center gap-2 w-full min-h-0">
      {/* Polaroid-style frame */}
      <div
        className={`bg-white rounded-lg shadow-lg shadow-rose-100/60 rotate-[-1deg] w-full ${
          compact ? "p-1.5 pb-4 max-w-full" : "p-3 pb-12 max-w-[280px]"
        }`}
      >
        {isVideo ? (
          <video
            src={mediaUrl}
            className="max-h-[280px] w-full h-auto mx-auto object-contain rounded-sm"
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={mediaUrl}
            alt="Memory"
            className="max-h-[280px] w-full h-auto mx-auto object-contain rounded-sm"
            draggable={false}
          />
        )}
      </div>
      {caption && (
        <CaptionWithToggle caption={caption} compact={compact} />
      )}
    </div>
  );
}

function CaptionWithToggle({
  caption,
  compact,
}: {
  caption: string;
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  // Compact cards (e.g. in grid): short clamped preview only.
  if (compact) {
    return (
      <p className="text-rose-500/80 text-center font-medium italic px-1 text-[10px] line-clamp-2">
        {caption}
      </p>
    );
  }

  // Full-size card: clamp to 3 lines with Show more; when expanded, full text (card scrolls).
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setCanToggle(el.scrollHeight > el.clientHeight + 1);
  }, [caption, expanded]);

  return (
    <div className="flex flex-col items-center gap-1 px-2 mt-1 w-full min-h-0 shrink-0">
      <p
        ref={textRef}
        className={`text-rose-500/80 text-center font-medium italic text-sm whitespace-pre-line ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {caption}
      </p>
      {canToggle && (
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
