import { createHmac } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ADMIN_COOKIE = "admin_session";
const ADMIN_MAX_AGE = 7 * 24 * 60 * 60;

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

function setAdminCookie(res: VercelResponse): void {
  const token = createSessionToken("admin", ADMIN_MAX_AGE);
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ADMIN_MAX_AGE}`
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const adminPin = (process.env.ADMIN_PIN || "").trim();

  if (!adminPin) {
    console.error("ADMIN_PIN env var is not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  if (!pin || pin !== adminPin) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).json({ error: "Invalid PIN" });
  }

  try {
    setAdminCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Admin auth error:", err);
    return res.status(500).json({ error: "Server misconfigured" });
  }
}
