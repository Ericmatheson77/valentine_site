import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

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

function verifySessionToken(token: string): { role: string; exp: number } | null {
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [role, expStr, sig] = parts;
  if (role !== "viewer" && role !== "admin") return null;
  const exp = parseInt(expStr, 10);
  if (isNaN(exp)) return null;
  const expectedSig = sign(`${role}|${expStr}`);
  if (expectedSig === null || !safeEqual(sig, expectedSig)) return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;
  return { role, exp };
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
  const adminToken = cookies[ADMIN_COOKIE];
  if (adminToken) {
    const session = verifySessionToken(adminToken);
    if (session && session.role === "admin") return session;
  }
  const viewerToken = cookies[VIEWER_COOKIE];
  if (viewerToken) {
    const session = verifySessionToken(viewerToken);
    if (session && session.role === "viewer") return session;
  }
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ role: session.role });
}
