// R3-4 / P8: brand logos. ONE place logos are stored and read, so the email
// signature, generated documents, and the live preview all draw the SAME logo.
//
// A logo is stored two ways on purpose:
//   1. a data URI on brand_logos.data_uri, the canonical render. A data URI is
//      the only image source that renders reliably in an EXTERNAL email inbox and
//      in a printed/generated document, with no signed-URL expiry and no auth. So
//      every place that embeds the logo embeds the data URI.
//   2. a copy in the private `assets` bucket (for the Library + provenance).
//
// The UI shows the data URI as a real <img> (a LIVE PREVIEW), never raw code.
import { admin } from "./supabase-admin";
import { emit } from "./events";

export const LOGO_BRANDS = ["nisria", "maisha", "ahadi"] as const;
export type LogoBrand = (typeof LOGO_BRANDS)[number];

export type BrandLogo = { brand: string; data_uri: string; mime: string | null; updated_at: string };

// Max bytes for a stored logo data URI. A logo is small art; cap so a data URI
// stays light enough to inline in an email and a doc (Postgres text is fine, but
// huge inline images bloat every send).
const MAX_LOGO_BYTES = 400_000;

export async function getLogos(): Promise<Record<string, BrandLogo>> {
  const { data } = await admin().from("brand_logos").select("brand,data_uri,mime,updated_at");
  const out: Record<string, BrandLogo> = {};
  for (const r of (data || []) as BrandLogo[]) out[r.brand] = r;
  return out;
}

export async function getLogo(brand: string): Promise<BrandLogo | null> {
  const { data } = await admin().from("brand_logos").select("brand,data_uri,mime,updated_at").eq("brand", brand).maybeSingle();
  return (data as BrandLogo) || null;
}

// Store a logo for a brand from raw bytes. Writes the data URI (canonical) + a
// Library copy, upserting so re-uploading replaces it. Returns ok + the data URI.
export async function saveLogo(args: {
  brand: string;
  buf: Buffer;
  mime: string;
  filename?: string;
  actor?: string;
}): Promise<{ ok: boolean; data_uri?: string; error?: string }> {
  const brand = (args.brand || "nisria").toLowerCase();
  if (!LOGO_BRANDS.includes(brand as LogoBrand)) return { ok: false, error: "unknown brand" };
  if (!args.buf?.length) return { ok: false, error: "empty file" };
  if (args.buf.length > MAX_LOGO_BYTES) return { ok: false, error: `logo too large (keep under ${Math.round(MAX_LOGO_BYTES / 1000)} KB)` };
  const mime = args.mime || "image/png";
  if (!mime.startsWith("image/")) return { ok: false, error: "logo must be an image" };

  const db = admin();
  const data_uri = `data:${mime};base64,${args.buf.toString("base64")}`;

  // keep a Library copy for provenance (best-effort, never blocks the save)
  let asset_id: string | null = null;
  let storage_path: string | null = null;
  try {
    const ext = mime.split("/")[1]?.replace("+xml", "") || "png";
    storage_path = `${brand}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await db.storage.from("assets").upload(storage_path, args.buf, { contentType: mime, upsert: true });
    if (!upErr) {
      const { data: asset } = await db
        .from("assets")
        .insert({ brand, type: "image", title: args.filename || `${brand} logo`, description: `${brand} brand logo`, storage_path, mime, size_bytes: args.buf.length, source: "logo-upload", created_by: args.actor || "Nur" })
        .select("id")
        .single();
      asset_id = (asset?.id as string) ?? null;
    } else {
      storage_path = null;
    }
  } catch {
    storage_path = null;
  }

  await db.from("brand_logos").upsert(
    { brand, data_uri, mime, asset_id, storage_path, updated_by: args.actor || "Nur", updated_at: new Date().toISOString() },
    { onConflict: "brand" },
  );
  await emit({ type: "brand.logo_updated", source: "settings", actor: args.actor || "Nur", subject_type: "brand_logo", payload: { brand } });
  return { ok: true, data_uri };
}

export async function deleteLogo(brand: string): Promise<void> {
  await admin().from("brand_logos").delete().eq("brand", brand);
  await emit({ type: "brand.logo_removed", source: "settings", actor: "Nur", subject_type: "brand_logo", payload: { brand } });
}

// A small <img> tag for the logo to drop into an email signature or document
// letterhead. Empty string when no logo, so callers can fall back to a wordmark.
export function logoImgTag(logo: BrandLogo | null | undefined, opts: { height?: number; alt?: string } = {}): string {
  if (!logo?.data_uri) return "";
  const h = opts.height || 40;
  const alt = (opts.alt || "logo").replace(/"/g, "");
  return `<img src="${logo.data_uri}" alt="${alt}" style="height:${h}px;width:auto;display:inline-block" />`;
}
