import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { admin } from "../../../../../lib/supabase-admin";

// CHUNKED MEDIA INTAKE (2026-07-20, KT #206724).
//
// Vercel rejects any serverless request body over 4.5 MB at the EDGE, before the route
// runs. The bot base64s media into JSON (a 4/3 inflation), so anything over roughly 3 MB
// of source media came back 413 and was dropped: the bot logged "ingest non-200" and the
// receipt vanished. Measured on prod 2026-07-20: 4 MB body -> route runs, 4.5 MB -> 413.
// Two live losses in that day's logs alone, and this survived the fromMe fix.
//
// The bot posts the file in pieces here, then calls /api/group/ingest normally with
// `media_path` instead of `media_base64`. Deliberately keeps the bot talking to exactly
// ONE counterparty with ONE secret: it never learns a storage credential and never gains
// a second network dependency. That is the whole reason for reassembling server-side
// rather than handing the bot a signed upload URL.
//
// Parts live under a private prefix and are deleted the moment the file is assembled.
// A dropped chunk would otherwise orphan its siblings forever, so the first chunk of any
// upload also sweeps parts older than PART_TTL_MS.

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "assets";
const PARTS = "group-ingest/_parts";
const DONE = "group-ingest/_assembled";
const MAX_PARTS = 12;                      // 12 x 2MB ceiling == the bot's 15MB cap
// Decoded ceiling for one part. MUST leave room for base64's 4/3 inflation under the
// 4.5MB edge limit: 3_000_000 -> 4_000_000 encoded. An earlier 3_500_000 encoded to
// 4_666_667 and would itself have been 413'd, which is the exact bug this endpoint
// exists to fix. The wall in eval/unit/chunked-media.test.mjs enforces the arithmetic.
const MAX_PART_BYTES = 3_000_000;
const MAX_TOTAL_BYTES = 20_000_000;        // hard stop, above the bot's own cap
const PART_TTL_MS = 6 * 60 * 60 * 1000;    // orphaned parts are swept after 6h

const safeId = (s: string) => String(s || "").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80);

async function sweepOrphans(db: any) {
  try {
    const { data: dirs } = await db.storage.from(BUCKET).list(PARTS, { limit: 200 });
    const cutoff = Date.now() - PART_TTL_MS;
    for (const d of dirs || []) {
      const { data: parts } = await db.storage.from(BUCKET).list(`${PARTS}/${d.name}`, { limit: MAX_PARTS + 1 });
      if (!parts?.length) continue;
      const newest = Math.max(...parts.map((p: any) => Date.parse(p.created_at || p.updated_at || 0) || 0));
      if (newest && newest < cutoff) {
        await db.storage.from(BUCKET).remove(parts.map((p: any) => `${PARTS}/${d.name}/${p.name}`));
      }
    }
  } catch { /* best effort: a failed sweep must never block an upload */ }
}

export async function POST(req: NextRequest) {
  const h = Buffer.from(req.headers.get("x-group-secret") || "");
  const e = Buffer.from(process.env.GROUP_BOT_SECRET || "\0");
  if (h.length !== e.length || !timingSafeEqual(h, e)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const uploadId = safeId(body.upload_id);
  const index = Number(body.index);
  const total = Number(body.total);
  const data = String(body.data || "");
  if (!uploadId || !Number.isInteger(index) || !Number.isInteger(total)) {
    return NextResponse.json({ ok: false, error: "upload_id, index and total are required" }, { status: 400 });
  }
  if (total < 1 || total > MAX_PARTS || index < 0 || index >= total) {
    return NextResponse.json({ ok: false, error: `index/total out of range (max ${MAX_PARTS} parts)` }, { status: 400 });
  }
  const buf = Buffer.from(data, "base64");
  if (!buf.length || buf.length > MAX_PART_BYTES) {
    return NextResponse.json({ ok: false, error: "part empty or too large" }, { status: 400 });
  }

  const db = admin();
  if (index === 0) await sweepOrphans(db);

  // upsert so a retried chunk is not a duplicate part
  const partPath = `${PARTS}/${uploadId}/${String(index).padStart(3, "0")}`;
  const { error: upErr } = await db.storage.from(BUCKET)
    .upload(partPath, buf, { contentType: "application/octet-stream", upsert: true });
  if (upErr) {
    return NextResponse.json({ ok: false, error: `part store failed: ${upErr.message}` }, { status: 500 });
  }

  if (index < total - 1) {
    return NextResponse.json({ ok: true, received: index, of: total });
  }

  // Final part: assemble. Verify every part is present first, so a lost chunk fails
  // loudly here rather than silently producing a truncated receipt.
  const { data: listed, error: listErr } = await db.storage.from(BUCKET).list(`${PARTS}/${uploadId}`, { limit: MAX_PARTS + 1 });
  if (listErr) return NextResponse.json({ ok: false, error: `list failed: ${listErr.message}` }, { status: 500 });
  const names = (listed || []).map((p: any) => p.name).sort();
  if (names.length !== total) {
    return NextResponse.json(
      { ok: false, error: `incomplete upload: have ${names.length} of ${total} parts`, have: names.length, want: total },
      { status: 409 });
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  for (const n of names) {
    const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(`${PARTS}/${uploadId}/${n}`);
    if (dlErr || !blob) return NextResponse.json({ ok: false, error: `part ${n} unreadable` }, { status: 500 });
    const b = Buffer.from(await blob.arrayBuffer());
    bytes += b.length;
    if (bytes > MAX_TOTAL_BYTES) return NextResponse.json({ ok: false, error: "assembled file too large" }, { status: 413 });
    chunks.push(b);
  }

  const mime = String(body.mime || "application/octet-stream").slice(0, 120);
  const finalPath = `${DONE}/${uploadId}`;
  const { error: finErr } = await db.storage.from(BUCKET)
    .upload(finalPath, Buffer.concat(chunks), { contentType: mime, upsert: true });
  if (finErr) return NextResponse.json({ ok: false, error: `assemble failed: ${finErr.message}` }, { status: 500 });

  await db.storage.from(BUCKET).remove(names.map((n: string) => `${PARTS}/${uploadId}/${n}`));

  return NextResponse.json({ ok: true, assembled: true, path: finalPath, bytes, parts: total });
}
