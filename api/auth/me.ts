import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSessionFromRequest } from "../_lib/auth";

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
