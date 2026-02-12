import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Lock,
  Loader2,
  Save,
  Trash2,
  Check,
  AlertCircle,
  ImageIcon,
  Film,
  CalendarDays,
  LogOut,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import type { MemoryEntry, MemoryType } from "../types";
import CardBack from "../components/CardBack";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PhotoWithDate {
  key: string;
  url: string;
  date: string | null; // "YYYY-MM-DD" from EXIF, provided by API
  webDisplayable: boolean;
  mediaType: "image" | "video";
}

type ToastType = "success" | "error";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStoredPin(): string | null {
  return sessionStorage.getItem("admin-pin");
}

function storePin(pin: string) {
  sessionStorage.setItem("admin-pin", pin);
}

function clearPin() {
  sessionStorage.removeItem("admin-pin");
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function deriveType(mediaCount: number): MemoryType {
  if (mediaCount === 0) return "text";
  if (mediaCount === 1) return "photo";
  return "gallery";
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AdminPage() {
  const [pin, setPin] = useState(getStoredPin() || "");
  const [authed, setAuthed] = useState(!!getStoredPin());
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  if (!authed) {
    return (
      <PinGate
        pin={pin}
        setPin={setPin}
        error={authError}
        loading={authLoading}
        onSubmit={async () => {
          setAuthLoading(true);
          setAuthError("");
          try {
            const res = await fetch("/api/admin/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pin }),
            });
            if (res.ok) {
              storePin(pin);
              setAuthed(true);
            } else {
              setAuthError("Invalid PIN. Try again.");
            }
          } catch {
            setAuthError("Network error. Please retry.");
          } finally {
            setAuthLoading(false);
          }
        }}
      />
    );
  }

  return (
    <AdminDashboard
      onLogout={() => {
        clearPin();
        setAuthed(false);
        setPin("");
      }}
    />
  );
}

// ─── PIN Gate ───────────────────────────────────────────────────────────────

function PinGate({
  pin,
  setPin,
  error,
  loading,
  onSubmit,
}: {
  pin: string;
  setPin: (v: string) => void;
  error: string;
  loading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-cream flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg shadow-rose-100/50 p-8 w-full max-w-xs text-center">
        <div className="w-14 h-14 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-rose-400" />
        </div>
        <h1 className="font-display text-xl text-rose-600 font-semibold mb-1">
          Admin Access
        </h1>
        <p className="text-sm text-rose-400 mb-6">Enter your PIN to continue</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="w-full px-4 py-3 rounded-xl border border-rose-200 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent mb-3"
            autoFocus
          />
          {error && (
            <p className="text-red-500 text-xs mb-3 flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full py-3 rounded-xl bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              "Unlock"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Admin Dashboard ────────────────────────────────────────────────────────

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const storedPin = getStoredPin() || "";

  // State
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [photos, setPhotos] = useState<PhotoWithDate[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(true);

  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFromS3Loading, setDeleteFromS3Loading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(
    null
  );

  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((msg: string, type: ToastType) => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Load photos from S3 (API returns EXIF dates server-side)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/photos", {
          headers: { "admin-pin": storedPin },
        });
        if (!res.ok) throw new Error("Failed to load photos");
        const data: PhotoWithDate[] = await res.json();
        setPhotos(data);
      } catch (err) {
        console.error(err);
        showToast("Failed to load photos from S3", "error");
      } finally {
        setPhotosLoading(false);
      }
    })();
  }, [storedPin, showToast]);

  // Load all memories
  const loadMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      if (!res.ok) throw new Error("Failed to load memories");
      const data: MemoryEntry[] = await res.json();
      setMemories(data);
    } catch (err) {
      console.error(err);
    } finally {
      setMemoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // When the selected date changes, load existing entry into the form
  const existingEntry = memories.find((m) => m.date === selectedDate);

  useEffect(() => {
    if (existingEntry) {
      setMessageText(existingEntry.text);
      setSelectedUrls(new Set(existingEntry.media || []));
    } else {
      setMessageText("");
      setSelectedUrls(new Set());
    }
  }, [selectedDate, existingEntry?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  // All navigable dates for preview (sorted saved dates + current selectedDate)
  const previewDates = useMemo(() => {
    const dates = [...new Set([...memories.map((m) => m.date), selectedDate])];
    return dates.sort();
  }, [memories, selectedDate]);

  // Keyboard navigation for preview modal
  useEffect(() => {
    if (!previewOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewOpen(false);
      } else if (e.key === "ArrowLeft") {
        setPreviewDate((prev) => {
          const cur = prev || selectedDate;
          const idx = previewDates.indexOf(cur);
          return idx > 0 ? previewDates[idx - 1] : cur;
        });
      } else if (e.key === "ArrowRight") {
        setPreviewDate((prev) => {
          const cur = prev || selectedDate;
          const idx = previewDates.indexOf(cur);
          return idx < previewDates.length - 1 ? previewDates[idx + 1] : cur;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen, previewDates, selectedDate]);

  // Determine which photo URLs are already used in any saved memory
  const usedUrls = new Set(
    memories.flatMap((m) => m.media || [])
  );

  // Filter state: default to showing only unused photos from the selected date
  const [filterMode, setFilterMode] = useState<"date" | "unused" | "all">("date");

  const filteredPhotos = photos.filter((p) => {
    // Always show photos that are currently selected (so they don't vanish)
    if (selectedUrls.has(p.url)) return true;

    if (filterMode === "date") {
      // Only unused photos from the selected date
      return p.date === selectedDate && !usedUrls.has(p.url);
    }
    if (filterMode === "unused") {
      // All unused photos regardless of date
      return !usedUrls.has(p.url);
    }
    // "all" — show everything
    return true;
  });

  // Photo grouping (applied to filtered list)
  const matchingPhotos = filteredPhotos.filter((p) => p.date === selectedDate);
  const otherDates = [
    ...new Set(
      filteredPhotos
        .filter((p) => p.date && p.date !== selectedDate)
        .map((p) => p.date!)
    ),
  ].sort();
  const undatedPhotos = filteredPhotos.filter((p) => !p.date);

  // Toggle photo selection
  const togglePhoto = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  // Save
  const handleSave = async () => {
    if (!messageText.trim() && selectedUrls.size === 0) {
      showToast("Please add a message or select photos", "error");
      return;
    }

    setSaving(true);
    const media = [...selectedUrls];
    const type = deriveType(media.length);

    try {
      const res = await fetch("/api/memories", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "admin-pin": storedPin,
        },
        body: JSON.stringify({ date: selectedDate, type, text: messageText.trim(), media }),
      });

      if (!res.ok) throw new Error("Save failed");
      showToast("Memory saved!", "success");
      await loadMemories();
    } catch {
      showToast("Failed to save. Please retry.", "error");
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!existingEntry) return;
    if (!confirm("Delete this memory? This cannot be undone.")) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/memories", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "admin-pin": storedPin,
        },
        body: JSON.stringify({ date: selectedDate }),
      });

      if (!res.ok) throw new Error("Delete failed");
      showToast("Memory deleted", "success");
      setMessageText("");
      setSelectedUrls(new Set());
      await loadMemories();
    } catch {
      showToast("Failed to delete. Please retry.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteFromS3 = async () => {
    const keys = photos.filter((p) => selectedUrls.has(p.url)).map((p) => p.key);
    if (keys.length === 0) return;
    if (
      !confirm(
        `Permanently delete ${keys.length} file(s) from the S3 bucket? This cannot be undone.`
      )
    )
      return;
    setDeleteFromS3Loading(true);
    try {
      const res = await fetch("/api/admin/photos/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admin-pin": storedPin,
        },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      showToast(data.message || `Deleted ${keys.length} file(s) from bucket`, "success");
      setSelectedUrls(new Set());
      setPhotos((prev) => prev.filter((p) => !keys.includes(p.key)));
    } catch {
      showToast("Failed to delete from S3. Please retry.", "error");
    } finally {
      setDeleteFromS3Loading(false);
    }
  };

  // Delete all original (non-processed) files from S3
  const [deletingOriginals, setDeletingOriginals] = useState(false);
  const [originalCount, setOriginalCount] = useState<number | null>(null);

  const fetchOriginalCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/photos?source=originals", {
        headers: { "admin-pin": storedPin },
      });
      if (!res.ok) return;
      const data = await res.json();
      setOriginalCount(data.length);
    } catch {
      // ignore
    }
  }, [storedPin]);

  useEffect(() => {
    fetchOriginalCount();
  }, [fetchOriginalCount]);

  const handleDeleteOriginals = async () => {
    // First fetch the list of originals to get their keys
    try {
      const listRes = await fetch("/api/admin/photos?source=originals", {
        headers: { "admin-pin": storedPin },
      });
      if (!listRes.ok) throw new Error("Failed to list originals");
      const originals: PhotoWithDate[] = await listRes.json();

      if (originals.length === 0) {
        showToast("No originals to delete", "success");
        return;
      }

      if (
        !confirm(
          `This will PERMANENTLY delete ${originals.length} original file(s) from S3.\n\nThese are the non-processed source files. Make sure you have verified the processed versions first.\n\nContinue?`
        )
      )
        return;

      setDeletingOriginals(true);
      const keys = originals.map((p) => p.key);

      // Delete in batches of 1000 (S3 limit)
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        const res = await fetch("/api/admin/photos/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "admin-pin": storedPin,
          },
          body: JSON.stringify({ keys: batch }),
        });
        if (!res.ok) throw new Error("Delete batch failed");
      }

      showToast(`Deleted ${keys.length} original file(s)`, "success");
      setOriginalCount(0);
    } catch {
      showToast("Failed to delete originals. Please retry.", "error");
    } finally {
      setDeletingOriginals(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-cream">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-rose-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-display text-lg text-rose-600 font-semibold">
            Memory Curator
          </h1>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-sm text-rose-400 hover:text-rose-600 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {/* ── A) Date Picker ────────────────────────────── */}
        <section>
          <label className="flex items-center gap-2 text-sm font-medium text-rose-500 mb-2">
            <CalendarDays className="w-4 h-4" /> Select Date
          </label>
          <div className="flex items-center gap-2 max-w-xs">
            <button
              onClick={() => {
                const d = new Date(selectedDate + "T00:00:00");
                d.setDate(d.getDate() - 1);
                setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
              }}
              className="shrink-0 w-9 h-9 rounded-lg border border-rose-200 bg-white flex items-center justify-center text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent bg-white"
            />
            <button
              onClick={() => {
                const d = new Date(selectedDate + "T00:00:00");
                d.setDate(d.getDate() + 1);
                setSelectedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
              }}
              className="shrink-0 w-9 h-9 rounded-lg border border-rose-200 bg-white flex items-center justify-center text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {memoriesLoading ? (
            <p className="text-xs text-rose-300 mt-2">Loading entries...</p>
          ) : existingEntry ? (
            <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm">
              <p className="text-rose-500 font-medium mb-1">
                Existing entry ({existingEntry.type})
              </p>
              <p className="text-rose-400 italic text-xs line-clamp-2">
                "{existingEntry.text}"
              </p>
              {existingEntry.media && existingEntry.media.length > 0 && (
                <p className="text-rose-300 text-xs mt-1">
                  {existingEntry.media.length} photo(s) attached
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-rose-300 mt-2">
              No entry for this date yet
            </p>
          )}
        </section>

        {/* ── B) Photo Browser ──────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-rose-500 mb-3">
            <ImageIcon className="w-4 h-4" /> Photo Library
            {selectedUrls.size > 0 && (
              <>
                <span className="text-xs bg-rose-100 text-rose-500 px-2 py-0.5 rounded-full">
                  {selectedUrls.size} selected
                </span>
                <button
                  type="button"
                  onClick={handleDeleteFromS3}
                  disabled={deleteFromS3Loading}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {deleteFromS3Loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete from S3
                </button>
              </>
            )}
          </div>

          {/* Filter toggle */}
          <div className="flex gap-1.5 mb-4">
            {([
              { mode: "date" as const, label: "This date (unused)" },
              { mode: "unused" as const, label: "All unused" },
              { mode: "all" as const, label: "All photos" },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  filterMode === mode
                    ? "bg-rose-500 text-white border-rose-500"
                    : "bg-white text-rose-400 border-rose-200 hover:border-rose-300"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-rose-300 self-center">
              {filteredPhotos.length} of {photos.length} photos
            </span>
          </div>

          {photosLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-rose-300 animate-spin" />
              <span className="ml-2 text-sm text-rose-400">
                Loading photos...
              </span>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <p className="text-sm text-rose-300 py-8 text-center">
              {photos.length === 0
                ? "No photos found in S3 bucket"
                : filterMode === "date"
                  ? "No unused photos for this date"
                  : filterMode === "unused"
                    ? "All photos are already used"
                    : "No photos found"}
            </p>
          ) : (
            <div className="space-y-6">
              {/* Photos matching selected date */}
              {matchingPhotos.length > 0 && (
                <PhotoGroup
                  label={`Photos from ${formatDateHeading(selectedDate)}`}
                  highlight
                  photos={matchingPhotos}
                  selectedUrls={selectedUrls}
                  onToggle={togglePhoto}
                />
              )}

              {/* Photos from other dates */}
              {otherDates.map((date) => (
                <PhotoGroup
                  key={date}
                  label={formatDateHeading(date)}
                  photos={photos.filter((p) => p.date === date)}
                  selectedUrls={selectedUrls}
                  onToggle={togglePhoto}
                />
              ))}

              {/* Undated photos */}
              {undatedPhotos.length > 0 && (
                <PhotoGroup
                  label="Undated"
                  photos={undatedPhotos}
                  selectedUrls={selectedUrls}
                  onToggle={togglePhoto}
                />
              )}
            </div>
          )}
        </section>

        {/* ── C) Compose Form ───────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-rose-100 p-5">
          <h3 className="text-sm font-medium text-rose-500 mb-3">
            Compose Memory for{" "}
            <span className="font-semibold">
              {formatDateHeading(selectedDate)}
            </span>
          </h3>

          {/* Selected photos preview */}
          {selectedUrls.size > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
              {[...selectedUrls].map((url) => (
                <div
                  key={url}
                  className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-rose-300"
                >
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => togglePhoto(url)}
                    className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white flex items-center justify-center rounded-bl-lg text-xs"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-rose-300 mb-1">
            Type:{" "}
            <span className="font-medium text-rose-400">
              {deriveType(selectedUrls.size)}
            </span>
            {selectedUrls.size > 0 && ` (${selectedUrls.size} photo${selectedUrls.size > 1 ? "s" : ""})`}
          </p>

          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Write your love note or caption..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-rose-200 text-rose-700 placeholder:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-transparent resize-none mb-4"
          />

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || (!messageText.trim() && selectedUrls.size === 0)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? "Saving..." : "Save Memory"}
            </button>

            <button
              onClick={() => {
                setPreviewDate(selectedDate);
                setPreviewOpen(true);
              }}
              disabled={!messageText.trim() && selectedUrls.size === 0 && !existingEntry}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-rose-200 text-rose-500 font-medium hover:bg-rose-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>

            {existingEntry && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-red-200 text-red-500 font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Delete
              </button>
            )}
          </div>
        </section>

        {/* ── Shrink & convert (run locally) ───────────────── */}
        <section className="bg-amber-50/80 rounded-2xl border border-amber-100 p-4">
          <h3 className="text-sm font-medium text-amber-700 mb-2">
            Shrink & convert media
          </h3>
          <p className="text-xs text-amber-600 mb-2">
            To create smaller copies (with metadata preserved) in a separate S3 prefix, run locally (requires ffmpeg, Node, and AWS env):
          </p>
          <code className="block text-xs bg-white/80 rounded-lg px-3 py-2 text-amber-800 font-mono break-all">
            npm run convert-media:dry
          </code>
          <p className="text-xs text-amber-600 mt-2">
            Remove <code className="bg-white/60 px-1 rounded">--dry-run</code> to actually convert and upload to the <code className="bg-white/60 px-1 rounded">processed/</code> prefix. Then delete originals above after confirming.
          </p>
        </section>

        {/* ── Existing Entries Overview ──────────────────── */}
        <section>
          <h3 className="text-sm font-medium text-rose-500 mb-3">
            All Curated Memories ({memories.length})
          </h3>
          {memories.length === 0 ? (
            <p className="text-xs text-rose-300">No memories yet.</p>
          ) : (
            <div className="space-y-2">
              {memories.map((m) => (
                <button
                  key={m.date}
                  onClick={() => setSelectedDate(m.date)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors ${
                    m.date === selectedDate
                      ? "bg-rose-50 border-rose-300"
                      : "bg-white border-rose-100 hover:border-rose-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-rose-600">
                      {formatDateHeading(m.date)}
                    </span>
                    <span className="text-xs text-rose-400 bg-rose-50 px-2 py-0.5 rounded-full">
                      {m.type}
                    </span>
                  </div>
                  <p className="text-xs text-rose-400 mt-1 line-clamp-1 italic">
                    "{m.text}"
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Cleanup: Delete Originals ─────────────────── */}
        {originalCount !== null && originalCount > 0 && (
          <section className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
            <h3 className="text-sm font-medium text-amber-700 mb-2">
              Cleanup: Original Files
            </h3>
            <p className="text-xs text-amber-600 mb-3">
              There are <span className="font-semibold">{originalCount}</span> original
              (non-processed) file(s) still in your S3 bucket. Once you've verified the
              processed versions look correct, you can delete the originals to save space.
            </p>
            <button
              onClick={handleDeleteOriginals}
              disabled={deletingOriginals}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {deletingOriginals ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {deletingOriginals
                ? "Deleting originals..."
                : `Delete all ${originalCount} original(s)`}
            </button>
          </section>
        )}
      </main>

      {/* Preview Modal */}
      {previewOpen && (() => {
        // The entry to preview: if previewDate matches the compose form's selectedDate,
        // use the live form values; otherwise use the saved entry
        const getPreviewEntry = (date: string): MemoryEntry | null => {
          if (date === selectedDate) {
            // Show live compose form content
            const urls = [...selectedUrls];
            const type: MemoryType =
              urls.length === 0 ? "text" : urls.length === 1 ? "photo" : "gallery";
            if (!messageText.trim() && urls.length === 0) return null;
            return {
              date,
              type,
              text: messageText,
              media: urls.length > 0 ? urls : undefined,
            };
          }
          return memories.find((m) => m.date === date) || null;
        };

        const currentDate = previewDate || selectedDate;
        const previewEntry = getPreviewEntry(currentDate);

        const currentIdx = previewDates.indexOf(currentDate);
        const canGoLeft = currentIdx > 0;
        const canGoRight = currentIdx < previewDates.length - 1;

        const goLeft = () => {
          if (canGoLeft) setPreviewDate(previewDates[currentIdx - 1]);
        };
        const goRight = () => {
          if (canGoRight) setPreviewDate(previewDates[currentIdx + 1]);
        };

        const formattedDate = new Date(currentDate + "T00:00:00").toLocaleDateString(
          "en-US",
          { weekday: "long", month: "long", day: "numeric", year: "numeric" }
        );

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className="relative flex flex-col items-center max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setPreviewOpen(false)}
                className="absolute -top-2 -right-2 z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Date heading */}
              <p className="text-white/90 text-sm font-medium mb-3 text-center">
                {formattedDate}
              </p>

              {/* Card preview */}
              <div className="w-full aspect-[3/4] max-w-[320px]">
                {previewEntry ? (
                  <CardBack entry={previewEntry} />
                ) : (
                  <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center shadow-lg border border-rose-100/50">
                    <p className="text-rose-300 text-sm italic">No memory for this date</p>
                  </div>
                )}
              </div>

              {/* Navigation arrows */}
              <div className="flex items-center gap-6 mt-4">
                <button
                  onClick={goLeft}
                  disabled={!canGoLeft}
                  className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <span className="text-white/70 text-xs font-mono">
                  {currentIdx + 1} / {previewDates.length}
                </span>

                <button
                  onClick={goRight}
                  disabled={!canGoRight}
                  className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <Check className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Photo Group ────────────────────────────────────────────────────────────

function PhotoGroup({
  label,
  photos,
  selectedUrls,
  onToggle,
  highlight = false,
}: {
  label: string;
  photos: PhotoWithDate[];
  selectedUrls: Set<string>;
  onToggle: (url: string) => void;
  highlight?: boolean;
}) {
  return (
    <div>
      <h4
        className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
          highlight ? "text-rose-500" : "text-rose-400"
        }`}
      >
        {label}
        {highlight && (
          <span className="ml-2 text-[10px] bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full normal-case font-medium">
            current date
          </span>
        )}
      </h4>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((photo) => {
          const isSelected = selectedUrls.has(photo.url);
          const isVideo = photo.mediaType === "video";
          return (
            <button
              key={photo.key}
              onClick={() => onToggle(photo.url)}
              className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                isSelected
                  ? "border-rose-400 ring-2 ring-rose-300 ring-offset-1"
                  : "border-transparent hover:border-rose-200"
              }`}
            >
              {isVideo && photo.webDisplayable ? (
                <video
                  src={photo.url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : !isVideo && photo.webDisplayable ? (
                <img
                  src={photo.url}
                  alt={photo.key}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-rose-50 flex flex-col items-center justify-center gap-1 p-1">
                  {isVideo ? (
                    <Film className="w-6 h-6 text-rose-300" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-rose-300" />
                  )}
                  <span className="text-[9px] text-rose-400 font-medium text-center leading-tight truncate w-full">
                    {photo.key.split("/").pop()}
                  </span>
                  <span className="text-[8px] text-rose-300 uppercase">
                    {photo.key.split(".").pop()}
                  </span>
                </div>
              )}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
