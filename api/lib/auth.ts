import { createHmac, timingSafeEqual } from "crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export type Role = "viewer" | "admin";

interface SessionPayload {
  role: Role;
  exp: number;
}

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

export function createSessionToken(role: Role, maxAgeSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = `${role}|${exp}`;
  const sig = sign(payload);
  if (!sig) throw new Error("AUTH_SECRET env var is not set");
  return `${payload}|${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split("|");
  if (parts.length !== 3) return null;

  const [role, expStr, sig] = parts;
  if (role !== "viewer" && role !== "admin") return null;

  const exp = parseInt(expStr, 10);
  if (isNaN(exp)) return null;

  const expectedSig = sign(`${role}|${expStr}`);
  if (expectedSig === null || !safeEqual(sig, expectedSig)) return null;

  if (Math.floor(Date.now() / 1000) > exp) return null;

  return { role: role as Role, exp };
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

export function getSessionFromRequest(req: VercelRequest): SessionPayload | null {
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

export function getAdminSessionFromRequest(req: VercelRequest): SessionPayload | null {
  const cookies = parseCookies(req);
  const adminToken = cookies[ADMIN_COOKIE];
  if (adminToken) {
    const session = verifySessionToken(adminToken);
    if (session && session.role === "admin") return session;
  }
  return null;
}

export function requireViewer(req: VercelRequest, res: VercelResponse): SessionPayload | null {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

export function requireAdmin(req: VercelRequest, res: VercelResponse): boolean {
  const session = getAdminSessionFromRequest(req);
  if (session) return true;

  const pin = req.headers["admin-pin"];
  if (pin && pin === process.env.ADMIN_PIN) return true;

  res.setHeader("Cache-Control", "no-store");
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

const VIEWER_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
const ADMIN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function cookieOptions(maxAge: number): string {
  return `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function setViewerCookie(res: VercelResponse): void {
  const token = createSessionToken("viewer", VIEWER_MAX_AGE);
  res.setHeader(
    "Set-Cookie",
    `${VIEWER_COOKIE}=${token}; ${cookieOptions(VIEWER_MAX_AGE)}`
  );
}

export function setAdminCookie(res: VercelResponse): void {
  const token = createSessionToken("admin", ADMIN_MAX_AGE);
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=${token}; ${cookieOptions(ADMIN_MAX_AGE)}`
  );
}

export function clearViewerCookie(res: VercelResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${VIEWER_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

export function clearAdminCookie(res: VercelResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

// Prevent this file from being deployed as a route (Vercel expects default export for handlers)
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(404).end();
}
