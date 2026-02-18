import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setViewerCookie } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { password } = req.body || {};
  const viewerPassword = process.env.VIEWER_PASSWORD;

  if (!viewerPassword) {
    console.error("VIEWER_PASSWORD env var is not set");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  if (!password || password !== viewerPassword) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(401).json({ error: "Invalid password" });
  }

  setViewerCookie(res);
  return res.status(200).json({ ok: true });
}
