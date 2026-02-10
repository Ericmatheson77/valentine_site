import type { MemoryEntry } from "../types";
import Gallery from "./Gallery";
import { Quote } from "lucide-react";

interface CardBackProps {
  entry: MemoryEntry;
  compact?: boolean;
}

export default function CardBack({ entry, compact = false }: CardBackProps) {
  return (
    <div className="w-full h-full bg-white rounded-2xl p-4 flex flex-col items-center justify-center overflow-hidden shadow-lg shadow-rose-200/40 border border-rose-100/50">
      {entry.type === "text" && (
        <TextContent text={entry.text} compact={compact} />
      )}
      {entry.type === "photo" && (
        <PhotoContent
          imageUrl={entry.media?.[0] || ""}
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
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-2 py-3 text-center overflow-hidden">
      {!compact && <Quote className="w-6 h-6 text-rose-200 rotate-180 shrink-0" />}
      <p
        className={`font-display leading-relaxed text-rose-700 italic ${
          compact ? "text-xs line-clamp-6" : "text-xl"
        }`}
      >
        {text}
      </p>
      {!compact && <Quote className="w-6 h-6 text-rose-200 shrink-0" />}
    </div>
  );
}

function PhotoContent({
  imageUrl,
  caption,
  compact,
}: {
  imageUrl: string;
  caption: string;
  compact: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 w-full overflow-hidden">
      {/* Polaroid-style frame */}
      <div
        className={`bg-white rounded-lg shadow-lg shadow-rose-100/60 rotate-[-1deg] w-full ${
          compact ? "p-1.5 pb-4 max-w-full" : "p-3 pb-12 max-w-[280px]"
        }`}
      >
        <img
          src={imageUrl}
          alt="Memory"
          className="w-full aspect-[3/4] object-cover rounded-sm"
          draggable={false}
        />
      </div>
      <p
        className={`text-rose-500/80 text-center font-medium italic px-1 ${
          compact ? "text-[10px] line-clamp-2" : "text-sm mt-1"
        }`}
      >
        {caption}
      </p>
    </div>
  );
}
