/**
 * Build Date → Media Index for Processed S3 Media
 *
 * Scans the processed media prefix in S3, extracts EXIF dates for each item,
 * and writes a compact JSON index mapping each date (YYYY-MM-DD) to an array
 * of web-displayable media URLs.
 *
 * This lets the runtime API (e.g. /api/date-media) answer queries quickly
 * without re-reading EXIF for every request.
 *
 * Env: AWS_ACCESS_KEY_ID_DYNAMO, AWS_SECRET_ACCESS_KEY_DYNAMO, AWS_REGION, S3_BUCKET_NAME
 * Optional: S3_PROCESSED_PREFIX (default: "processed/")
 *
 * Usage:
 *   npx tsx scripts/build-date-media-index.ts
 *   npx tsx scripts/build-date-media-index.ts --dry-run
 */

import "dotenv/config";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import exifr from "exifr";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtempSync, rmSync, createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";

const BUCKET = process.env.S3_BUCKET_NAME || "";
const REGION = process.env.AWS_REGION || "us-west-1";
const PROCESSED_PREFIX = process.env.S3_PROCESSED_PREFIX ?? "processed/";

if (!BUCKET) {
  console.error("Set S3_BUCKET_NAME in the environment (e.g. from .env).");
  process.exit(1);
}

const s3 = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID_DYNAMO
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_DYNAMO,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DYNAMO!,
      }
    : undefined,
});

// Only index media types we can show on the web.
const WEB_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);
const WEB_VIDEO_EXTS = new Set([".mp4", ".webm"]);

function getExt(key: string): string {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(i).toLowerCase() : "";
}

function isWebMedia(key: string): boolean {
  const ext = getExt(key);
  return WEB_IMAGE_EXTS.has(ext) || WEB_VIDEO_EXTS.has(ext);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

async function streamToFile(body: Readable | AsyncIterable<Uint8Array>, path: string) {
  const out = createWriteStream(path);
  await pipeline(Readable.from(body as any), out);
}

function runFfprobe(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c) => (stdout += c.toString()));
    proc.stderr?.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

/**
 * Try to read a creation date from EXIF/metadata for an image object.
 * The caller provides the list of tag names to prefer, in order.
 */
async function getImageExifDate(
  key: string,
  preferredTags: string[]
): Promise<string | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Range: "bytes=0-65535", // first 64KB is enough for EXIF
      })
    );

    if (!res.Body) return null;

    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const exif = await exifr.parse(buffer, {
      pick: preferredTags,
    });

    let dt: unknown = null;
    for (const tag of preferredTags) {
      if (exif && Object.prototype.hasOwnProperty.call(exif, tag)) {
        dt = (exif as Record<string, unknown>)[tag];
        if (dt) break;
      }
    }

    if (dt instanceof Date && !isNaN(dt.getTime())) {
      return formatDate(dt);
    }

    return null;
  } catch (err) {
    console.warn("EXIF parse failed for", key, ":", (err as Error).message);
    return null;
  }
}

/**
 * Use ffprobe to extract the container-level creation_time for a video.
 * Falls back to null if ffprobe is unavailable or the tag is missing.
 */
async function getVideoCreationDateViaFfprobe(key: string): Promise<string | null> {
  // Download the object to a temporary file
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  if (!res.Body) return null;

  const tmpDir = mkdtempSync(join(tmpdir(), "video-meta-"));
  const ext = getExt(key) || ".mp4";
  const tmpPath = join(tmpDir, `video${ext}`);

  try {
    await streamToFile(res.Body as any, tmpPath);

    const { stdout, stderr, code } = await runFfprobe([
      "-v",
      "quiet",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream_tags=creation_time",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      tmpPath,
    ]);

    if (code !== 0) {
      if (stderr.trim()) {
        console.warn("ffprobe failed for", key, ":", stderr.trim());
      }
      return null;
    }

    const line = stdout.trim().split(/\r?\n/)[0]?.trim();
    if (!line) return null;

    const dt = new Date(line);
    if (!isNaN(dt.getTime())) {
      return formatDate(dt);
    }

    return null;
  } catch (err) {
    console.warn("ffprobe error for", key, ":", (err as Error).message);
    return null;
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Building date → media index");
  console.log("  Bucket:          ", BUCKET);
  console.log("  Processed prefix:", PROCESSED_PREFIX);
  console.log("  Dry run:         ", dryRun);
  console.log("");

  // 1. List all web-displayable media under the processed/ prefix
  const objects: { key: string; lastModified: Date | undefined }[] = [];
  let token: string | undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PROCESSED_PREFIX,
        ContinuationToken: token,
      })
    );

    for (const obj of result.Contents || []) {
      if (!obj.Key) continue;
      if (!isWebMedia(obj.Key)) continue;
      objects.push({ key: obj.Key, lastModified: obj.LastModified });
    }

    token = result.NextContinuationToken;
  } while (token);

  console.log(`Found ${objects.length} web media object(s) to index.`);
  if (objects.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // 2. Build date → URLs mapping
  const index: Record<string, string[]> = {};
  const BATCH_SIZE = 10;

  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const batch = objects.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${i + 1}-${Math.min(
        i + BATCH_SIZE,
        objects.length
      )} of ${objects.length}`
    );

    const results = await Promise.all(
      batch.map(async ({ key, lastModified }) => {
        const ext = getExt(key);

        let date: string | null = null;

        if (WEB_IMAGE_EXTS.has(ext)) {
          // Images: standard EXIF fields
          date = await getImageExifDate(key, [
            "DateTimeOriginal",
            "CreateDate",
            "ModifyDate",
          ]);
        } else if (WEB_VIDEO_EXTS.has(ext)) {
          // Videos: prefer container-level creation_time via ffprobe.
          // If that fails, last resort is the S3 LastModified time.
          date = await getVideoCreationDateViaFfprobe(key);

          if (!date && lastModified) {
            date = formatDate(lastModified);
          }
        }

        return { key, date };
      })
    );

    for (const { key, date } of results) {
      if (!date) continue; // skip undated media

      const encodedPath = key
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");

      const url = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${encodedPath}`;

      if (!index[date]) index[date] = [];
      index[date].push(url);
    }
  }

  const dates = Object.keys(index).sort();
  console.log(`Indexed ${dates.length} distinct date(s).`);

  const payload = Buffer.from(JSON.stringify(index, null, 2), "utf-8");
  const indexKey = `${PROCESSED_PREFIX.replace(/\/?$/, "/")}date-media-index.json`;

  console.log("");
  console.log("Index object key:", indexKey);
  console.log("Index size:      ", `${(payload.length / 1024).toFixed(1)} KB`);

  if (dryRun) {
    console.log("Dry run: not uploading index.");
    return;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: indexKey,
      Body: payload,
      ContentType: "application/json",
    })
  );

  console.log("Uploaded date-media index.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

