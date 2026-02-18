import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setAdminCookie } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { pin } = req.body || {};
  const adminPin = process.env.ADMIN_PIN;

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
