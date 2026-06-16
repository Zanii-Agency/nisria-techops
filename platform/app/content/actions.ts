"use server";
import { admin } from "../../lib/supabase-admin";
import { claude } from "../../lib/anthropic";
import { humanize, withHumanSystem } from "../../lib/humanize";
import { now } from "../../lib/now";
import { emit } from "../../lib/events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Channels supported on the composer.
const ALLOWED_CHANNELS = ["instagram", "facebook", "tiktok", "linkedin"];

function base(fd: FormData) {
  const channels = fd.getAll("channels").map(String).filter((c) => ALLOWED_CHANNELS.includes(c));
  const social_accounts: Record<string, any> = {};
  const tiktok = fd.getAll("tiktok_handles").map(String).filter(Boolean);
  if (channels.includes("tiktok") && tiktok.length) social_accounts.tiktok = tiktok;
  const linkedin = String(fd.get("linkedin_account") || "");
  if (channels.includes("linkedin") && linkedin) social_accounts.linkedin = linkedin;
  const instagram = String(fd.get("instagram_account") || "");
  if (channels.includes("instagram") && instagram) social_accounts.instagram = instagram;
  const facebook = String(fd.get("facebook_account") || "");
  if (channels.includes("facebook") && facebook) social_accounts.facebook = facebook;
  return {
    brand_id: String(fd.get("brand_id") || "") || null,
    channels: channels.length ? channels : ["instagram"],
    title: String(fd.get("title") || "") || null,
    scheduled_for: String(fd.get("scheduled_for") || "") || null,
    social_accounts,
  };
}

async function brandSlug(db: any, brand_id: string | null): Promise<string | null> {
  if (!brand_id) return null;
  const { data } = await db.from("brands").select("slug,name").eq("id", brand_id).single();
  return (data as any)?.slug || null;
}

async function fileToLibrary(db: any, opts: { body: string; brandSlugVal: string | null; createdBy: string }) {
  const title = opts.body.slice(0, 60) || "Untitled post";
  await db.from("assets").insert({
    type: "post",
    title,
    description: opts.body,
    brand: opts.brandSlugVal,
    source: "content",
    created_by: opts.createdBy,
  });
}

export async function composePost(fd: FormData) {
  const db = admin();
  const f = base(fd);
  const body = String(fd.get("body") || "").trim();
  if (!body) {
    redirect("/content?err=empty");
  }

  const asset_path = String(fd.get("asset_path") || "") || null;

  await db.from("content_posts").insert({
    ...f,
    body,
    image_url: asset_path,
    status: f.scheduled_for ? "scheduled" : "draft",
  });

  const slug = await brandSlug(db, f.brand_id);
  await fileToLibrary(db, { body, brandSlugVal: slug, createdBy: "Nur" });
  await emit({ type: "content.created", source: "content", actor: "Nur", payload: { channels: f.channels, brand: slug, accounts: f.social_accounts, has_media: !!asset_path } });

  revalidatePath("/content");
  revalidatePath("/library");
  redirect(`/content?ok=${f.scheduled_for ? "scheduled" : "drafted"}`);
}

export async function aiDraft(fd: FormData) {
  const db = admin();
  const f = base(fd);
  const brief = String(fd.get("body") || "").trim() || "a general post about our mission";
  const asset_path = String(fd.get("asset_path") || "") || null;

  let brand = "Nisria";
  if (f.brand_id) {
    const { data } = await db.from("brands").select("name").eq("id", f.brand_id).single();
    brand = (data as any)?.name || brand;
  }
  const n = await now();
  const rawBody = await claude(
    withHumanSystem(`You write short, warm, dignified social captions for ${brand}, a nonprofit helping children/families in Kenya, as a member of staff. No poverty-porn, no hype, 1-2 short sentences plus a soft call to action, tasteful emoji allowed. Target channels: ${f.channels.join(", ") || "instagram"}. The current date is ${n.long}.`),
    `Write a caption for: ${brief}`,
    300
  );
  const body = humanize(rawBody, { now: { long: n.long, today: n.today } });

  await db.from("content_posts").insert({
    ...f,
    body,
    image_url: asset_path,
    status: f.scheduled_for ? "scheduled" : "draft",
    created_by: "AI",
  });

  const slug = await brandSlug(db, f.brand_id);
  await fileToLibrary(db, { body, brandSlugVal: slug, createdBy: "AI" });
  await emit({ type: "content.created", source: "content", actor: "AI", payload: { channels: f.channels, brand: slug, accounts: f.social_accounts, ai: true, has_media: !!asset_path } });

  revalidatePath("/content");
  revalidatePath("/library");
  redirect("/content?ok=drafted_ai");
}

export async function setPostStatus(fd: FormData) {
  const id = String(fd.get("id"));
  const status = String(fd.get("status"));
  const patch: any = { status };
  if (status === "posted") patch.posted_at = new Date().toISOString();
  await admin().from("content_posts").update(patch).eq("id", id);
  revalidatePath("/content");
}

export async function rescheduleSubmit(fd: FormData) {
  const id = String(fd.get("id"));
  const scheduled_for = String(fd.get("scheduled_for") || "") || null;
  const patch: any = { scheduled_for };
  if (scheduled_for) patch.status = "scheduled";
  await admin().from("content_posts").update(patch).eq("id", id);
  revalidatePath("/content");
}

export async function deletePost(fd: FormData) {
  const id = String(fd.get("id"));
  await admin().from("content_posts").delete().eq("id", id);
  revalidatePath("/content");
}

// "Generate graphic" — uses OpenAI gpt-image-1 to render a brand-appropriate
// image, uploads it to the assets bucket, files an assets row, and emits an
// event so Nur can attach it in the next compose pass.
export async function generateGraphic(fd: FormData) {
  const db = admin();
  const f = base(fd);
  const brief = String(fd.get("body") || "").trim();

  let slug: string | null = null;
  let brandName = "Nisria";
  if (f.brand_id) {
    const { data } = await db.from("brands").select("slug,name").eq("id", f.brand_id).single();
    slug = (data as any)?.slug || null;
    brandName = (data as any)?.name || brandName;
  }

  if (!process.env.OPENAI_API_KEY) {
    await emit({
      type: "content.created",
      source: "content",
      actor: "Nur",
      payload: { kind: "graphic", status: "openai_key_missing", brand: slug, brief: brief || null },
    });
    revalidatePath("/content");
    redirect("/content?err=graphic_no_key");
  }

  const prompt = brief
    ? `Editorial social-media image for ${brandName}, a nonprofit helping children and families in Kenya. Subject: ${brief}. Warm, dignified, photographic, soft natural light, no text overlay, no logos.`
    : `Editorial social-media image for ${brandName}, a nonprofit helping children and families in Kenya. Warm, dignified, photographic, soft natural light, no text overlay, no logos.`;

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", n: 1 }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      await emit({ type: "content.created", source: "content", actor: "Nur", payload: { kind: "graphic", status: "openai_error", brand: slug, brief: brief || null, detail: detail.slice(0, 400) } });
      revalidatePath("/content");
      redirect("/content?err=graphic_failed");
    }
    const j: any = await r.json();
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) {
      await emit({ type: "content.created", source: "content", actor: "Nur", payload: { kind: "graphic", status: "openai_empty", brand: slug } });
      revalidatePath("/content");
      redirect("/content?err=graphic_failed");
    }
    const buf = Buffer.from(b64, "base64");
    const storage_path = `content/generated/${Date.now()}.png`;
    const { error: upErr } = await db.storage.from("assets").upload(storage_path, buf, { contentType: "image/png", upsert: true });
    if (upErr) {
      await emit({ type: "content.created", source: "content", actor: "Nur", payload: { kind: "graphic", status: "upload_failed", brand: slug, detail: upErr.message } });
      revalidatePath("/content");
      redirect("/content?err=graphic_failed");
    }
    await db.from("assets").insert({
      type: "image",
      title: (brief || `${brandName} graphic`).slice(0, 80),
      description: prompt.slice(0, 400),
      brand: slug,
      source: "content_generate",
      storage_path,
      mime: "image/png",
      created_by: "AI",
    });
    await emit({ type: "content.created", source: "content", actor: "Nur", payload: { kind: "graphic", status: "ok", brand: slug, storage_path } });
    revalidatePath("/content");
    revalidatePath("/library");
    redirect("/content?ok=graphic");
  } catch (e: any) {
    if (e?.digest && String(e.digest).includes("NEXT_REDIRECT")) throw e;
    await emit({ type: "content.created", source: "content", actor: "Nur", payload: { kind: "graphic", status: "exception", brand: slug, detail: e?.message?.slice(0, 400) } });
    revalidatePath("/content");
    redirect("/content?err=graphic_failed");
  }
}
