import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const VIEWER_COOKIE = "viewer_session";
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
  if (role !== "viewer" && role !== "admin") return null;
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

function getSessionFromRequest(req: VercelRequest): { role: string } | null {
  const cookies = parseCookies(req);
  if (cookies[ADMIN_COOKIE]) {
    const s = verifySessionToken(cookies[ADMIN_COOKIE]);
    if (s && s.role === "admin") return s;
  }
  if (cookies[VIEWER_COOKIE]) {
    const s = verifySessionToken(cookies[VIEWER_COOKIE]);
    if (s && s.role === "viewer") return s;
  }
  return null;
}

function requireViewer(req: VercelRequest, res: VercelResponse): boolean {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
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

/**
 * Load the precomputed date → URLs index from S3.
 * Shape: { "YYYY-MM-DD": ["https://...", ...], ... }
 */
async function loadDateMediaIndex(): Promise<Record<string, string[]>> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: INDEX_KEY,
    })
  );

  if (!res.Body) {
    throw new Error("Empty index body");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf-8");
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

  if (!requireViewer(req, res)) return;

  if (!BUCKET) {
    return res.status(500).json({ error: "S3_BUCKET_NAME not configured" });
  }

  const date = req.query.date as string | undefined;
  if (!date) {
    return res.status(400).json({ error: "Missing required query param: date" });
  }

  try {
    const index = await loadDateMediaIndex();
    const urls = index[date] ?? [];

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");
    return res.status(200).json({ date, urls });
  } catch (error) {
    console.error("date-media error:", error);
    return res.status(500).json({ error: "Failed to load media for date" });
  }
}

