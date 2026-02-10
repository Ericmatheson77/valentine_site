import type { MemoryEntry } from "./types";

export const memories: MemoryEntry[] = [
  {
    date: "2026-02-09",
    type: "text",
    text: "Every love story is beautiful, but ours is my favorite. Here's to the beginning of our forever.",
  },
  {
    date: "2026-02-10",
    type: "photo",
    media: [
      "https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&h=800&fit=crop",
    ],
    text: "The moment I knew you were the one.",
  },
  {
    date: "2026-02-11",
    type: "gallery",
    media: [
      "https://images.unsplash.com/photo-1529634597503-139d3726fed5?w=600&h=800&fit=crop",
      "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&h=800&fit=crop",
      "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=600&h=800&fit=crop",
    ],
    text: "Adventures with you are my favorite kind of adventures.",
  },
  {
    date: "2026-02-12",
    type: "text",
    text: "I choose you. And I'll choose you over and over. Without pause, without a doubt, in a heartbeat — I'll keep choosing you.",
  },
  {
    date: "2026-02-13",
    type: "photo",
    media: [
      "https://images.unsplash.com/photo-1474552226712-ac0f0961a954?w=600&h=800&fit=crop",
    ],
    text: "Your smile is my sunrise and your kiss is my sunset.",
  },
  {
    date: "2026-02-14",
    type: "gallery",
    media: [
      "https://images.unsplash.com/photo-1518568814500-bf0f8d125f46?w=600&h=800&fit=crop",
      "https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?w=600&h=800&fit=crop",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=800&fit=crop",
    ],
    text: "Happy Valentine's Day, my love. Every day with you feels like a celebration.",
  },
  {
    date: "2026-02-15",
    type: "text",
    text: "You are my today and all of my tomorrows. I can't wait to marry you.",
  },
];

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
export function getToday(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Returns the memory for today, or undefined if none exists
 */
export function getTodayMemory(): MemoryEntry | undefined {
  const today = getToday();
  return memories.find((m) => m.date === today);
}

/**
 * Returns a memory by date string, only if date <= today
 */
export function getMemoryByDate(date: string): MemoryEntry | undefined {
  const today = getToday();
  if (date > today) return undefined;
  return memories.find((m) => m.date === date);
}

/**
 * Returns all memories that are unlocked (date <= today)
 */
export function getUnlockedMemories(): MemoryEntry[] {
  const today = getToday();
  return memories.filter((m) => m.date <= today);
}

/**
 * Returns all memories sorted by date ascending
 */
export function getAllMemories(): MemoryEntry[] {
  return [...memories].sort((a, b) => a.date.localeCompare(b.date));
}
