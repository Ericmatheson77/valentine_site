/**
 * Prune Date → Media Index by removing entries for files that no longer exist.
 *
 * Reads the existing date-media-index.json from S3, checks each URL's file
 * still exists, and removes entries for missing files. Much faster than rebuilding
 * the entire index from scratch.
 *
 * Env: Same as build-date-media-index (S3_BUCKET_NAME, AWS_*, etc.). Loads .env via dotenv.
 *
 * Usage:
 *   npx tsx scripts/prune-date-media-index.ts
 *   npx tsx scripts/prune-date-media-index.ts --dry-run
 */

import "dotenv/config";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.S3_BUCKET_NAME || "";
const REGION = process.env.AWS_REGION || "us-east-1";
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

const INDEX_KEY = `${PROCESSED_PREFIX.replace(/\/?$/, "/")}date-media-index.json`;

/**
 * Extract S3 key from a full S3 URL.
 * e.g. "https://bucket.s3.region.amazonaws.com/path/to/file.jpg" -> "path/to/file.jpg"
 */
function extractKeyFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/^\/+/, "");
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/**
 * Check if an S3 object exists.
 */
async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
    return true;
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Other errors (permission, etc.) - assume exists to be safe
    console.warn(`  Warning: Could not check ${key}:`, err.message);
    return true;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Prune date-media index");
  console.log("  Bucket:          ", BUCKET);
  console.log("  Index key:       ", INDEX_KEY);
  console.log("  Dry run:         ", dryRun);
  console.log("");

  // 1. Load existing index
  let index: Record<string, string[]>;
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: INDEX_KEY,
      })
    );

    if (!res.Body) {
      console.error("Index file exists but has no body.");
      process.exit(1);
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const text = buffer.toString("utf-8");

    index = JSON.parse(text);
    if (!index || typeof index !== "object") {
      console.error("Invalid index JSON.");
      process.exit(1);
    }
  } catch (err: any) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      console.error("Index file not found. Run build-index first.");
      process.exit(1);
    }
    throw err;
  }

  const originalTotal = Object.values(index).reduce((sum, urls) => sum + urls.length, 0);
  console.log(`Loaded index: ${Object.keys(index).length} dates, ${originalTotal} URLs total.`);
  console.log("");

  // 2. Check each URL and remove missing files
  const cleaned: Record<string, string[]> = {};
  let checked = 0;
  let removed = 0;

  for (const [date, urls] of Object.entries(index)) {
    const validUrls: string[] = [];

    for (const url of urls) {
      checked++;
      const key = extractKeyFromUrl(url);
      if (!key) {
        console.warn(`  Skipping malformed URL: ${url}`);
        removed++;
        continue;
      }

      const exists = await objectExists(key);
      if (exists) {
        validUrls.push(url);
      } else {
        removed++;
        if (checked % 100 === 0 || removed <= 10) {
          console.log(`  Removed: ${key}`);
        }
      }

      if (checked % 100 === 0) {
        process.stdout.write(`\rChecked ${checked}/${originalTotal}...`);
      }
    }

    if (validUrls.length > 0) {
      cleaned[date] = validUrls;
    }
  }

  console.log(`\n\nChecked ${checked} URLs.`);
  console.log(`Removed ${removed} missing file(s).`);
  console.log(`Kept ${Object.values(cleaned).reduce((sum, urls) => sum + urls.length, 0)} valid URLs.`);

  const datesRemoved = Object.keys(index).length - Object.keys(cleaned).length;
  if (datesRemoved > 0) {
    console.log(`Removed ${datesRemoved} date(s) with no remaining files.`);
  }

  if (removed === 0) {
    console.log("\nNo changes needed - all files exist.");
    return;
  }

  const payload = Buffer.from(JSON.stringify(cleaned, null, 2), "utf-8");
  console.log("");
  console.log("Cleaned index size:", `${(payload.length / 1024).toFixed(1)} KB`);

  if (dryRun) {
    console.log("Dry run: not uploading cleaned index.");
    return;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: INDEX_KEY,
      Body: payload,
      ContentType: "application/json",
    })
  );

  console.log("Uploaded pruned index.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
