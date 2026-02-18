import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const VIEWER_COOKIE = "viewer_session";
const VIEWER_MAX_AGE = 365 * 24 * 60 * 60;

function getSecret(): string | null {
  return process.env.AUTH_SECRET || null;
}

function sign(payload: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function createSessionToken(role: string, maxAgeSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = `${role}|${exp}`;
  const sig = sign(payload);
  if (!sig) throw new Error("AUTH_SECRET env var is not set");
  return `${payload}|${sig}`;
}

function setViewerCookie(res: VercelResponse): void {
  const token = createSessionToken("viewer", VIEWER_MAX_AGE);
  res.setHeader(
    "Set-Cookie",
    `${VIEWER_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${VIEWER_MAX_AGE}`
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const password = typeof body.password === "string" ? body.password.trim() : "";
  const viewerPassword = (process.env.VIEWER_PASSWORD || "").trim();

  if (!viewerPassword) {
    console.error("VIEWER_PASSWORD env var is not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  if (!password || password !== viewerPassword) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).json({ error: "Invalid password" });
  }

  try {
    setViewerCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Viewer login error:", err);
    return res.status(500).json({ error: "Server misconfigured" });
  }
}
