import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import exifr from "exifr";

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

const MEDIA_EXTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".mp4",
  ".webm",
];

const WEB_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const WEB_VIDEO_EXTS = new Set([".mp4", ".webm"]);

function getExt(key: string): string {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(i).toLowerCase() : "";
}

function isMedia(key: string): boolean {
  return MEDIA_EXTS.some((ext) => key.toLowerCase().endsWith(ext));
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Simple in-memory cache for EXIF dates per object key. This avoids
// re-reading and re-parsing EXIF data on every request within the same
// lambda/container instance, which can otherwise be very slow when you
// have many media files.
const exifDateCache = new Map<string, string | null>();

async function getExifDate(key: string): Promise<string | null> {
  if (exifDateCache.has(key)) {
    return exifDateCache.get(key)!;
  }

  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Range: "bytes=0-65535",
      })
    );

    if (!res.Body) return null;

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

    let formatted: string | null = null;
    if (dt instanceof Date && !isNaN(dt.getTime())) {
      formatted = formatDate(dt);
    }

    exifDateCache.set(key, formatted);
    return formatted;
  } catch {
    exifDateCache.set(key, null);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!BUCKET) {
    return res.status(500).json({ error: "S3_BUCKET_NAME not configured" });
  }

  const date = req.query.date as string | undefined;
  if (!date) {
    return res.status(400).json({ error: "Missing required query param: date" });
  }

  try {
    const mediaUrls: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: PROCESSED_PREFIX,
          ContinuationToken: continuationToken,
        })
      );

      for (const obj of result.Contents || []) {
        if (!obj.Key || !isMedia(obj.Key)) continue;

        const exifDate = await getExifDate(obj.Key);
        if (exifDate !== date) continue;

        const ext = getExt(obj.Key);
        const isWebImage = WEB_IMAGE_EXTS.has(ext);
        const isWebVideo = WEB_VIDEO_EXTS.has(ext);
        if (!isWebImage && !isWebVideo) continue;

        const encodedPath = obj.Key.split("/").map((part) => encodeURIComponent(part)).join("/");

        mediaUrls.push(
          `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodedPath}`
        );
      }

      continuationToken = result.NextContinuationToken;
    } while (continuationToken);

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(200).json({ date, urls: mediaUrls });
  } catch (error) {
    console.error("date-media error:", error);
    return res.status(500).json({ error: "Failed to load media for date" });
  }
}

