import Shell from "../../components/Shell";
import { Card } from "../../components/ui";
import { admin } from "../../lib/supabase-admin";
import { composePost, aiDraft, generateGraphic } from "./actions";
import { Sparkles, ImagePlus, Wand2, CheckCircle2, AlertTriangle } from "lucide-react";
import ChannelPicker from "./ChannelPicker";
import ContentBoard from "./ContentBoard";

export const dynamic = "force-dynamic";

const OK_MESSAGES: Record<string, string> = {
  scheduled: "Scheduled. n8n picks it up at the due time.",
  drafted: "Saved to drafts.",
  drafted_ai: "AI draft saved. Edit it from the Drafts column.",
  graphic: "Graphic generated and filed to the Library. Attach it from the picker below.",
};
const ERR_MESSAGES: Record<string, string> = {
  empty: "Write something first, then add to queue.",
  graphic_no_key: "Graphic generator needs OPENAI_API_KEY. Set it in Vercel env.",
  graphic_failed: "Graphic generation failed. Check the OpenAI status or try again.",
};

export default async function Content({ searchParams }: { searchParams?: { ok?: string; err?: string } }) {
  const db = admin();
  const { data: brands } = await db
    .from("brands")
    .select("id,name,slug,tiktok_handles,linkedin_account,instagram_account,facebook_account")
    .order("name");
  const { data: posts } = await db
    .from("content_posts")
    .select("*,brand:brands(name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (posts || []) as any[];

  const { data: imgAssets } = await db
    .from("assets")
    .select("id,title,storage_path,brand")
    .eq("type", "image")
    .not("storage_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(24);
  const mediaList = (imgAssets || []) as any[];

  const mediaSigned: Record<string, string> = {};
  if (mediaList.length) {
    const { data } = await db.storage.from("assets").createSignedUrls(mediaList.map((a) => a.storage_path), 3600);
    (data || []).forEach((s: any, i: number) => {
      if (s?.signedUrl) mediaSigned[mediaList[i].storage_path] = s.signedUrl;
    });
  }

  const postPaths = list.filter((p) => p.image_url).map((p) => p.image_url);
  const postSigned: Record<string, string> = {};
  if (postPaths.length) {
    const { data } = await db.storage.from("assets").createSignedUrls(postPaths, 3600);
    (data || []).forEach((s: any, i: number) => {
      if (s?.signedUrl) postSigned[postPaths[i]] = s.signedUrl;
    });
  }
  const allSigned = { ...mediaSigned, ...postSigned };

  const okMsg = searchParams?.ok ? OK_MESSAGES[searchParams.ok] : null;
  const errMsg = searchParams?.err ? ERR_MESSAGES[searchParams.err] : null;

  return (
    <Shell title="Content" sub="Compose, draft with AI, attach a photo from the Library, queue across Instagram, Facebook, TikTok, and LinkedIn.">
      {okMsg && (
        <div className="flex" style={{ gap: 8, padding: "10px 14px", borderRadius: 10, background: "var(--green-50)", color: "var(--green-900, #1f6c3a)", marginBottom: 14, fontWeight: 600, fontSize: 13 }}>
          <CheckCircle2 size={16} /> {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="flex" style={{ gap: 8, padding: "10px 14px", borderRadius: 10, background: "var(--rose-50, #fdecec)", color: "var(--rose-900, #8a2222)", marginBottom: 14, fontWeight: 600, fontSize: 13 }}>
          <AlertTriangle size={16} /> {errMsg}
        </div>
      )}

      <Card title="Compose">
        <form className="card-pad stack" style={{ gap: 14 }}>
          <ChannelPicker brands={(brands || []) as any[]} defaultBrandId={(brands as any[])?.[0]?.id} />

          <textarea name="body" rows={3} placeholder="Write the post, or type a brief and hit Draft with AI…" />

          {/* Media from Library */}
          <div>
            <div className="flex" style={{ marginBottom: 8, gap: 6 }}>
              <ImagePlus size={15} color="var(--teal-700)" />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Attach media from Library</span>
              <span className="muted" style={{ fontSize: 11.5 }}>pick one image</span>
            </div>
            {mediaList.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>
                No images in the Library yet. Hit "Generate graphic" below, or upload in <a href="/library">Library</a>.
              </div>
            ) : (
              <div className="flex" style={{ gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                <label
                  className="flex"
                  style={{ flex: "0 0 auto", width: 84, height: 84, borderRadius: 12, border: "2px dashed var(--line-2)", justifyContent: "center", alignItems: "center", cursor: "pointer", color: "var(--muted)", fontSize: 11.5, textAlign: "center", gap: 4 }}
                >
                  <input type="radio" name="asset_path" value="" defaultChecked style={{ width: "auto" }} />
                  None
                </label>
                {mediaList.map((a) => {
                  const url = mediaSigned[a.storage_path];
                  return (
                    <label
                      key={a.id}
                      title={a.title}
                      style={{ flex: "0 0 auto", width: 84, height: 84, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", cursor: "pointer", position: "relative" }}
                    >
                      {url ? (
                        <img src={url} alt={a.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 10.5, color: "var(--faint)", padding: 4, textAlign: "center" }}>{a.title}</span>
                      )}
                      <input
                        type="radio"
                        name="asset_path"
                        value={a.storage_path}
                        style={{ position: "absolute", top: 5, left: 5, width: "auto", margin: 0, accentColor: "var(--teal)" }}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex" style={{ flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button className="btn teal" formAction={composePost} type="submit">Add to queue</button>
            <button className="actionchip" formAction={aiDraft} type="submit"><span className="ico"><Sparkles size={15} /></span> Draft with AI</button>
            <button className="actionchip" formAction={generateGraphic} type="submit"><span className="ico"><Wand2 size={15} /></span> Generate graphic</button>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            Generated graphics are filed to the Library so you can attach them on the next compose pass. Scheduled posts fan out via n8n at the due time.
          </div>
        </form>
      </Card>

      <div className="between" style={{ marginTop: 20, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Content pieces</h2>
        <span className="muted" style={{ fontSize: 12 }}>{list.length} total · click any card to open</span>
      </div>

      <ContentBoard posts={list as any[]} mediaSigned={allSigned} />
    </Shell>
  );
}
