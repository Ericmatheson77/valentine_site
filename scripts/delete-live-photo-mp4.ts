/**
 * Delete .mp4/.mov files that are the "live" companion of a .jpg photo.
 *
 * Live photos = same base filename, e.g. "Photo.jpg" + "Photo.mp4" or "Photo.mov".
 * This script finds every .mp4 and .mov that has a matching .jpg/.jpeg and deletes the video.
 *
 * Env: Same as convert-s3-media (S3_BUCKET_NAME, AWS_*, etc.). Loads .env via dotenv.
 *
 * Usage:
 *   npx tsx scripts/delete-live-photo-mp4.ts [--dry-run] [--prefix path/]
 */

import "dotenv/config";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.S3_BUCKET_NAME || "";
const REGION = process.env.AWS_REGION || "us-east-1";

const s3 = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID_DYNAMO
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID_DYNAMO,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DYNAMO!,
      }
    : undefined,
});

function baseName(key: string): string {
  const i = key.lastIndexOf(".");
  return i >= 0 ? key.slice(0, i) : key;
}

function isJpg(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
}

function isLiveVideo(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.endsWith(".mp4") || lower.endsWith(".mov");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prefixArg = process.argv.find((a) => a.startsWith("--prefix="));
  const prefix = prefixArg ? prefixArg.slice("--prefix=".length) : process.env.S3_SOURCE_PREFIX ?? "";

  if (!BUCKET) {
    console.error("Set S3_BUCKET_NAME in the environment (e.g. from .env).");
    process.exit(1);
  }

  console.log("Delete Live Photo .mp4 companions");
  console.log("  Bucket:", BUCKET);
  console.log("  Prefix:", prefix || "(root)");
  console.log("  Dry run:", dryRun);
  console.log("");

  const allKeys: string[] = [];
  let token: string | undefined;
  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix || undefined,
        ContinuationToken: token,
      })
    );
    for (const obj of result.Contents || []) {
      if (obj.Key) allKeys.push(obj.Key);
    }
    token = result.NextContinuationToken;
  } while (token);

  const jpgBases = new Set<string>();
  for (const key of allKeys) {
    if (isJpg(key)) jpgBases.add(baseName(key));
  }

  const toDelete: string[] = [];
  for (const key of allKeys) {
    if (isLiveVideo(key) && jpgBases.has(baseName(key))) {
      toDelete.push(key);
    }
  }

  console.log(`Found ${jpgBases.size} .jpg/.jpeg file(s).`);
  console.log(`Found ${toDelete.length} .mp4/.mov file(s) that have a matching .jpg/.jpeg (will delete).`);
  if (toDelete.length === 0) {
    console.log("Nothing to delete.");
    process.exit(0);
  }

  if (dryRun) {
    console.log("\nWould delete:");
    toDelete.slice(0, 30).forEach((k) => console.log("  ", k));
    if (toDelete.length > 30) {
      console.log("  ... and", toDelete.length - 30, "more.");
    }
    console.log("\nRun without --dry-run to actually delete.");
    process.exit(0);
  }

  const batchSize = 1000;
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: false,
        },
      })
    );
    const count = (result.Deleted || []).length;
    deleted += count;
    if (result.Errors?.length) {
      for (const e of result.Errors) {
        console.error("  Error:", e.Key, e.Code, e.Message);
      }
    }
    console.log(`Deleted batch: ${count} (total ${deleted}/${toDelete.length})`);
  }

  console.log("\nDone. Deleted", deleted, "live-photo video companion(s) (.mp4/.mov).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
