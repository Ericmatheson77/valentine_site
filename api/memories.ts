import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

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

function getAdminSessionFromRequest(req: VercelRequest): { role: string } | null {
  const cookies = parseCookies(req);
  const t = cookies[ADMIN_COOKIE];
  if (t) {
    const s = verifySessionToken(t);
    if (s && s.role === "admin") return s;
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

function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  if (getAdminSessionFromRequest(req)) return true;
  const pin = req.headers["admin-pin"];
  if (pin && pin === process.env.ADMIN_PIN) return true;
  res.setHeader("Cache-Control", "no-store");
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_DYNAMO!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DYNAMO!,
  },
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "valentine_memories";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // --- GET: requires viewer or admin session ---
  if (req.method === "GET") {
    if (!requireViewer(req, res)) return;

    try {
      const result = await docClient.send(
        new ScanCommand({ TableName: TABLE_NAME })
      );

      const memories = (result.Items || []).map((item) => ({
        date: item.date_id,
        type: item.type,
        text: item.text,
        media: item.media || undefined,
      }));

      memories.sort((a, b) => a.date.localeCompare(b.date));

      res.setHeader(
        "Cache-Control",
        "s-maxage=60, stale-while-revalidate=30"
      );

      return res.status(200).json(memories);
    } catch (error) {
      console.error("DynamoDB scan error:", error);
      return res.status(500).json({ error: "Failed to fetch memories" });
    }
  }

  // --- PUT: admin-only, upsert a memory ---
  if (req.method === "PUT") {
    if (!requireAdmin(req, res)) return;

    const { date, type, text, media } = req.body || {};

    if (!date || !type) {
      return res
        .status(400)
        .json({ error: "Missing required fields: date, type" });
    }

    try {
      const item: Record<string, unknown> = { date_id: date, type, text: text || "" };
      if (media && Array.isArray(media) && media.length > 0) {
        item.media = media;
      }

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        })
      );

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("DynamoDB put error:", error);
      return res.status(500).json({ error: "Failed to save memory" });
    }
  }

  // --- DELETE: admin-only, remove a memory by date ---
  if (req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;

    const { date } = req.body || {};

    if (!date) {
      return res.status(400).json({ error: "Missing required field: date" });
    }

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { date_id: date },
        })
      );

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("DynamoDB delete error:", error);
      return res.status(500).json({ error: "Failed to delete memory" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
