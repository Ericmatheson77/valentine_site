import type { VercelRequest, VercelResponse } from "@vercel/node";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DYNAMO!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DYNAMO!,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const pin = req.headers["admin-pin"];
  if (!pin || pin !== process.env.ADMIN_PIN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!BUCKET) {
    return res.status(500).json({ error: "S3_BUCKET_NAME not configured" });
  }

  const body = req.body as { keys?: string[] } | undefined;
  const keys = Array.isArray(body?.keys) ? body.keys : [];

  if (keys.length === 0) {
    return res.status(400).json({ error: "Request body must include keys: string[]" });
  }

  // S3 DeleteObjects accepts max 1000 per request
  const toDelete = keys.slice(0, 1000).map((Key) => ({ Key }));

  try {
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: toDelete,
          Quiet: false,
        },
      })
    );

    const deleted = (result.Deleted || []).map((o) => o.Key).filter(Boolean) as string[];
    const errors = (result.Errors || []).map((e) => ({ key: e.Key, code: e.Code, message: e.Message }));

    return res.status(200).json({
      deleted,
      errors: errors.length ? errors : undefined,
      message:
        errors.length === 0
          ? `Deleted ${deleted.length} file(s).`
          : `Deleted ${deleted.length}, ${errors.length} error(s).`,
    });
  } catch (error) {
    console.error("S3 delete error:", error);
    return res.status(500).json({ error: "Failed to delete objects from S3" });
  }
}
