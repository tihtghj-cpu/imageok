import { put, list, del, head } from "@vercel/blob";

// পাসওয়ার্ড: Vercel-এ ADMIN_PASSWORD সেট করলে সেটা, নইলে নিচের ডিফল্ট
const PASS = process.env.ADMIN_PASSWORD || "123@123";
const MAX_BYTES = 4.4 * 1024 * 1024; // Vercel Function রিকোয়েস্ট লিমিট ~4.5MB
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif" };
const MIME = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif" };

function makeKey(fileName, ext, w, h) {
  const base =
    fileName.replace(/\.[^.]+$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").toLowerCase().slice(0, 24) || "image";
  return `${Date.now().toString(36)}_${w}x${h}_${base}.${ext}`;
}

// key থেকেই নাম/সাইজ/সময় বের করা হয় (Vercel Blob-এ আলাদা মেটাডাটা নেই)
function toItem(key, size) {
  const m = key.match(/^([a-z0-9]+)_(\d+)x(\d+)_(.*)\.([a-z0-9]+)$/i);
  if (!m) return { key, name: key, type: "", size, width: 0, height: 0, added: 0 };
  return {
    key, name: `${m[4]}.${m[5]}`, type: MIME[m[5]] || "", size,
    width: Number(m[2]), height: Number(m[3]), added: parseInt(m[1], 36),
  };
}

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.headers["x-admin-key"] !== PASS) return res.status(401).json({ error: "unauthorized" });

  // তালিকা (নতুন আগে)
  if (req.method === "GET") {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    let blobs = [], cursor;
    do {
      const r = await list({ prefix: "img/", limit: 1000, cursor });
      blobs = blobs.concat(r.blobs);
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    blobs.sort((a, b) => (a.pathname < b.pathname ? 1 : -1));
    const total = blobs.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
    const items = blobs.slice((page - 1) * limit, page * limit)
      .map((b) => toItem(b.pathname.slice(4), b.size));
    return res.status(200).json({ items, total, page, pages, limit });
  }

  // আপলোড
  if (req.method === "POST") {
    const type = (req.headers["content-type"] || "").split(";")[0].trim();
    const ext = EXT[type];
    if (!ext) return res.status(400).json({ error: "শুধু JPG, PNG, GIF, WEBP, AVIF সমর্থিত" });
    const buf = await readBody(req);
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: "ছবি অনেক বড় (সর্বোচ্চ ~4.4MB)" });
    let name = "image";
    try { name = decodeURIComponent(req.headers["x-file-name"] || "image"); } catch {}
    const w = Number(req.headers["x-width"]) || 0, h = Number(req.headers["x-height"]) || 0;
    const key = makeKey(name, ext, w, h);
    await put(`img/${key}`, buf, { access: "public", contentType: type, addRandomSuffix: false });
    return res.status(201).json({ item: toItem(key, buf.length) });
  }

  // মুছে ফেলা
  if (req.method === "DELETE") {
    const key = String(req.query.key || "");
    if (!/^[a-z0-9._-]+$/i.test(key)) return res.status(400).json({ error: "invalid key" });
    try { const b = await head(`img/${key}`); await del(b.url); } catch {}
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: "not found" });
}
