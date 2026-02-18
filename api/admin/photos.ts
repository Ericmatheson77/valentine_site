import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import exifr from "exifr";

const ADMIN_COOKIE = "admin_session";

function getSecret(): string | null {
  return process.env.AUTH_SECRET || null;
}

function sign(payload: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function verifySessionToken(token: string): { role: string } | null {
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [role, expStr, sig] = parts;
  if (role !== "admin") return null;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp)) return null;
  const expectedSig = sign(`${role}|${expStr}`);
  if (expectedSig === null || !safeEqual(sig, expectedSig)) return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;
  return { role };
}

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie || "";
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [name, ...rest] = pair.trim().split("=");
    if (name) cookies[name.trim()] = rest.join("=").trim();
  }
  return cookies;
}

function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const cookies = parseCookies(req);
  const t = cookies[ADMIN_COOKIE];
  if (t) {
    const s = verifySessionToken(t);
    if (s && s.role === "admin") return true;
  }
  const pin = req.headers["admin-pin"];
  if (pin && pin === process.env.ADMIN_PIN) return true;
  res.setHeader("Cache-Control", "no-store");
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DYNAMO!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DYNAMO!,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME || "";
const REGION = process.env.AWS_REGION || "us-west-1";
const PROCESSED_PREFIX = process.env.S3_PROCESSED_PREFIX ?? "processed/";
const INDEX_KEY = `${PROCESSED_PREFIX.replace(/\/?$/, "/")}date-media-index.json`;
const MEDIA_EXTS = [
  // Web-native images
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg",
  // Apple images
  ".heic", ".heif",
  // Other images
  ".tiff", ".tif", ".bmp",
  // RAW
  ".raw", ".cr2", ".nef", ".arw", ".dng",
  // Video
  ".mp4", ".mov", ".webm", ".avi", ".mkv", ".wmv",
];

const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".avi", ".mkv", ".wmv"]);
const WEB_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const WEB_VIDEO_EXTS = new Set([".mp4", ".webm"]);

function getExt(key: string): string {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(i).toLowerCase() : "";
}

function isMedia(key: string): boolean {
  return MEDIA_EXTS.some((ext) => key.toLowerCase().endsWith(ext));
}

function classifyMedia(key: string): { type: "image" | "video"; webDisplayable: boolean } {
  const ext = getExt(key);
  if (VIDEO_EXTS.has(ext)) {
    return { type: "video", webDisplayable: WEB_VIDEO_EXTS.has(ext) };
  }
  return { type: "image", webDisplayable: WEB_IMAGE_EXTS.has(ext) };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Read the first 64 KB of an S3 object and try to extract the EXIF date.
 */
async function getExifDate(key: string): Promise<string | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Range: "bytes=0-65535", // First 64 KB — enough for EXIF header
      })
    );

    if (!res.Body) return null;

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const exif = await exifr.parse(buffer, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });

    const dt =
      exif?.DateTimeOriginal || exif?.CreateDate || exif?.ModifyDate;

    if (dt instanceof Date && !isNaN(dt.getTime())) {
      return formatDate(dt);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Load the precomputed date → media index JSON from S3.
 * Shape: { "YYYY-MM-DD": ["https://bucket.s3.region.amazonaws.com/processed/...", ...], ... }
 */
async function loadProcessedIndex(): Promise<Record<string, string[]>> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: INDEX_KEY,
    })
  );

  if (!res.Body) {
    throw new Error("Empty index object body");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  const text = buffer.toString("utf-8");

  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid index JSON");
  }

  return parsed as Record<string, string[]>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAdmin(req, res)) return;

  if (!BUCKET) {
    return res.status(500).json({ error: "S3_BUCKET_NAME not configured" });
  }

  // ?source=originals returns only non-processed files (for bulk delete)
  // ?source=all returns everything
  // default: only processed/ prefix
  const source = (req.query.source as string) || "processed";

  try {
    // Fast path for processed media: use the precomputed date-media index if available.
    if (source === "processed") {
      try {
        const index = await loadProcessedIndex();
        const photos: {
          key: string;
          url: string;
          date: string | null;
          webDisplayable: boolean;
          mediaType: "image" | "video";
        }[] = [];

        for (const [date, urls] of Object.entries(index)) {
          for (const url of urls) {
            try {
              const urlObj = new URL(url);
              // Remove leading "/" and decode each path segment
              const path = urlObj.pathname.replace(/^\/+/, "");
              const key = decodeURIComponent(path);
              const { type: mediaType, webDisplayable } = classifyMedia(key);

              photos.push({
                key,
                url,
                date,
                webDisplayable,
                mediaType,
              });
            } catch {
              // Skip malformed URLs
              continue;
            }
          }
        }

        // Sort: dated first (by date), then undated (by key)
        photos.sort((a, b) => {
          if (a.date && b.date) return a.date.localeCompare(b.date);
          if (a.date && !b.date) return -1;
          if (!a.date && b.date) return 1;
          return a.key.localeCompare(b.key);
        });

        res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
        return res.status(200).json(photos);
      } catch (e) {
        // If the index is missing or invalid, fall back to the S3+EXIF scan below.
        console.warn("Failed to load processed index; falling back to S3 scan:", e);
      }
    }

    // 1. List media keys
    const mediaKeys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: source === "processed" ? PROCESSED_PREFIX : undefined,
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of result.Contents || []) {
        if (!obj.Key || !isMedia(obj.Key)) continue;

        if (source === "originals") {
          // Only files NOT under the processed prefix
          if (obj.Key.startsWith(PROCESSED_PREFIX)) continue;
        }

        mediaKeys.push(obj.Key);
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    // 2. For each file, read EXIF date + classify (in parallel, batched)
    const BATCH_SIZE = 10;
    const photos: { key: string; url: string; date: string | null; webDisplayable: boolean; mediaType: "image" | "video" }[] = [];

    for (let i = 0; i < mediaKeys.length; i += BATCH_SIZE) {
      const batch = mediaKeys.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (key) => {
          const { type: mediaType, webDisplayable } = classifyMedia(key);
          const date = await getExifDate(key);
          // Build a web URL where each path segment is encoded, but
          // slashes are preserved. Using encodeURIComponent on the whole
          // key was incorrectly encoding "/" as "%2F", which breaks S3 paths
          // and can surface as CORS-like errors in the browser.
          const encodedPath = key
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/");

          return {
            key,
            url: `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodedPath}`,
            date,
            webDisplayable,
            mediaType,
          };
        })
      );
      photos.push(...results);
    }

    // Sort: dated first (by date), then undated (by key)
    photos.sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return a.key.localeCompare(b.key);
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(200).json(photos);
  } catch (error) {
    console.error("S3 list/EXIF error:", error);
    return res.status(500).json({ error: "Failed to list photos" });
  }
}
