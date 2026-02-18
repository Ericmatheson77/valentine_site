import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!requireAdmin(req, res)) return;

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
