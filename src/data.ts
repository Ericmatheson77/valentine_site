import type { MemoryEntry } from "./types";

/**
 * Get today's date string in YYYY-MM-DD format (local time)
 */
export function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Fetch all memories from the API (backed by DynamoDB)
 */
export async function fetchMemories(): Promise<MemoryEntry[]> {
  const res = await fetch("/api/memories");
  if (!res.ok) {
    throw new Error(`Failed to fetch memories: ${res.status}`);
  }
  return res.json();
}
