/**
 * S3 Media Conversion Script
 *
 * Downloads photos/videos from S3, converts to smaller size while preserving
 * metadata (EXIF date, location), and uploads copies to a separate prefix.
 * Originals are left intact so you can delete them after confirming.
 *
 * Requires: Node 18+, ffmpeg in PATH (for video). Optional: sharp, heic-jpg-exif for images.
 *
 * Env: AWS_ACCESS_KEY_ID_DYNAMO, AWS_SECRET_ACCESS_KEY_DYNAMO, AWS_REGION, S3_BUCKET_NAME
 * Optional: S3_SOURCE_PREFIX (default: ""), S3_PROCESSED_PREFIX (default: "processed/")
 *
 * Usage: npx tsx scripts/convert-s3-media.ts [--dry-run] [--prefix path/]
 */

import "dotenv/config";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createWriteStream, mkdtempSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";
import { spawn } from "child_process";
import { pipeline } from "stream/promises";

const BUCKET = process.env.S3_BUCKET_NAME || "";
const REGION = process.env.AWS_REGION || "us-west-1";
const SOURCE_PREFIX = process.env.S3_SOURCE_PREFIX ?? "";
const PROCESSED_PREFIX = process.env.S3_PROCESSED_PREFIX ?? "processed/";

const s3 = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID_DYNAMO
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_DYNAMO,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DYNAMO!,
      }
    : undefined,
});

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"]);
const VIDEO_EXT = new Set([".mp4", ".mov"]);
const MAX_IMAGE_PX = 1920;
const JPEG_QUALITY = 85;
const VIDEO_CRF = 28;
const VIDEO_AUDIO_BITRATE = "128k";

function isImage(key: string): boolean {
  const lower = key.toLowerCase();
  return [...IMAGE_EXT].some((ext) => lower.endsWith(ext));
}

function isVideo(key: string): boolean {
  const lower = key.toLowerCase();
  return [...VIDEO_EXT].some((ext) => lower.endsWith(ext));
}

function isSupported(key: string): boolean {
  return isImage(key) || isVideo(key);
}

function getExt(key: string): string {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(i).toLowerCase() : "";
}

async function streamToFile(stream: Readable, path: string): Promise<void> {
  const out = createWriteStream(path);
  await pipeline(Readable.from(stream), out);
}

function runFfmpeg(args: string[], stdin?: Buffer): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", args, { stdio: stdin ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c) => (stdout += c.toString()));
    proc.stderr?.on("data", (c) => (stderr += c.toString()));
    if (stdin && proc.stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    }
    proc.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

async function convertImage(
  inputPath: string,
  outputPath: string,
  ext: string
): Promise<void> {
  const sharp = await import("sharp").catch(() => null);
  const heicToJpeg = await import("heic-jpg-exif").catch(() => null);

  if (ext === ".heic") {
    if (!heicToJpeg) {
      throw new Error("HEIC conversion requires: npm install heic-jpg-exif");
    }
    const inputBuf = readFileSync(inputPath);
    const convert = (heicToJpeg as { default?: (buf: Buffer) => Promise<Buffer> }).default ?? (heicToJpeg as (buf: Buffer) => Promise<Buffer>);
    const jpegBuf = await convert(inputBuf);
    if (sharp) {
      await sharp
        .default(jpegBuf)
        .resize(MAX_IMAGE_PX, MAX_IMAGE_PX, { fit: "inside", withoutEnlargement: true })
        .withMetadata()
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(outputPath);
    } else {
      const { writeFileSync } = await import("fs");
      writeFileSync(outputPath, jpegBuf);
    }
    return;
  }

  if (!sharp) {
    throw new Error("Image conversion requires: npm install sharp");
  }
  await sharp
    .default(inputPath)
    .resize(MAX_IMAGE_PX, MAX_IMAGE_PX, { fit: "inside", withoutEnlargement: true })
    .withMetadata()
    .toFormat(ext === ".png" ? "png" : "jpeg", ext === ".png" ? {} : { quality: JPEG_QUALITY })
    .toFile(outputPath);
}

async function convertVideo(inputPath: string, outputPath: string): Promise<void> {
  const { stdout, stderr, code } = await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-map_metadata",
    "0",
    "-c:v",
    "libx264",
    "-crf",
    String(VIDEO_CRF),
    "-preset",
    "medium",
    "-c:a",
    "aac",
    "-b:a",
    VIDEO_AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  if (code !== 0) {
    throw new Error(`ffmpeg failed (${code}): ${stderr || stdout}`);
  }
}

function outputKey(sourceKey: string, ext: string): string {
  const base = sourceKey.slice(0, sourceKey.length - ext.length);
  if (ext === ".heic") return `${base}.jpg`;
  if (ext === ".mov") return `${base}.mp4`;
  return sourceKey;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prefixArg = process.argv.find((a) => a.startsWith("--prefix="));
  const sourcePrefix = prefixArg ? prefixArg.slice("--prefix=".length) : SOURCE_PREFIX;

  if (!BUCKET) {
    console.error("Set S3_BUCKET_NAME in the environment (e.g. from .env).");
    process.exit(1);
  }

  console.log("S3 Media Conversion");
  console.log("  Bucket:", BUCKET);
  console.log("  Source prefix:", sourcePrefix || "(root)");
  console.log("  Processed prefix:", PROCESSED_PREFIX);
  console.log("  Dry run:", dryRun);
  console.log("");

  const list: string[] = [];
  let token: string | undefined;
  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: sourcePrefix,
        ContinuationToken: token,
      })
    );
    for (const obj of result.Contents || []) {
      if (obj.Key && isSupported(obj.Key)) list.push(obj.Key);
    }
    token = result.NextContinuationToken;
  } while (token);

  console.log(`Found ${list.length} file(s) to process.`);
  if (list.length === 0) {
    process.exit(0);
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "s3-convert-"));
  try {
    for (let i = 0; i < list.length; i++) {
      const key = list[i];
      const ext = getExt(key);
      const outKey = PROCESSED_PREFIX + outputKey(key, ext);
      console.log(`[${i + 1}/${list.length}] ${key} -> ${outKey}`);

      if (dryRun) continue;

      const getRes = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key })
      );
      const body = getRes.Body;
      if (!body) {
        console.error("  No body");
        continue;
      }

      const inputPath = join(tmpDir, `in${ext}`);
      const outputPath = join(tmpDir, `out${ext === ".heic" ? ".jpg" : ext === ".mov" ? ".mp4" : ext}`);
      await streamToFile(body as Readable, inputPath);

      try {
        if (isImage(key)) {
          await convertImage(inputPath, outputPath, ext);
        } else {
          await convertVideo(inputPath, outputPath);
        }
      } catch (err) {
        console.error("  Conversion error:", err);
        continue;
      }

      const outBuf = readFileSync(outputPath);
      const contentType =
        ext === ".heic"
          ? "image/jpeg"
          : ext === ".mov"
            ? "video/mp4"
            : ext === ".jpg" || ext === ".jpeg"
              ? "image/jpeg"
              : ext === ".png"
                ? "image/png"
                : ext === ".webp"
                  ? "image/webp"
                  : ext === ".gif"
                    ? "image/gif"
                    : "application/octet-stream";

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: outKey,
          Body: outBuf,
          ContentType: contentType,
        })
      );
      const inSize = statSync(inputPath).size;
      const outSize = statSync(outputPath).size;
      console.log(`  Uploaded ${(outSize / 1024).toFixed(1)} KB (was ${(inSize / 1024).toFixed(1)} KB)`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("");
  console.log("Done. Processed files are under prefix:", PROCESSED_PREFIX);
  console.log("After confirming they look correct, you can delete originals (e.g. via admin delete or S3 console).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
