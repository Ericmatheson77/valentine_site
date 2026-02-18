import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Clear both cookies; harmless if they don't exist
  const cookies = [
    "viewer_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    "admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  ];
  res.setHeader("Set-Cookie", cookies);
  return res.status(200).json({ ok: true });
}
