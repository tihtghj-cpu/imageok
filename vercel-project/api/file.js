import { head } from "@vercel/blob";

// পাবলিক ছবি: /uploads/<key>
export default async function handler(req, res) {
  const key = String(req.query.key || "");
  if (!/^[a-z0-9._-]+$/i.test(key)) return res.status(404).send("Not found");
  try {
    const b = await head(`img/${key}`);
    const r = await fetch(b.url);
    if (!r.ok) throw new Error("missing");
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", b.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
    return res.status(200).send(buf);
  } catch {
    return res.status(404).send("Not found");
  }
}
