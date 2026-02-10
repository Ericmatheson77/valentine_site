export type MemoryType = "text" | "photo" | "gallery";

export interface MemoryEntry {
  date: string; // "YYYY-MM-DD"
  type: MemoryType;
  media?: string[]; // photo URLs (for photo/gallery types)
  text: string; // quote, love note, or caption
}
