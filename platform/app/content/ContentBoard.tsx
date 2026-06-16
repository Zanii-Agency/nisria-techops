"use client";
import { useState, useTransition } from "react";
import { Badge } from "../../components/ui";
import { X, Calendar, Trash2, CheckCircle2 } from "lucide-react";
import { setPostStatus, deletePost, rescheduleSubmit } from "./actions";

type Post = {
  id: string;
  brand?: { name?: string } | null;
  body: string | null;
  image_url: string | null;
  channels: string[] | null;
  social_accounts?: Record<string, any> | null;
  status: string;
  scheduled_for: string | null;
  posted_at: string | null;
  created_at: string;
  created_by: string | null;
};

const COLS = [
  { key: "scheduled", label: "Scheduled", tone: "blue" as const },
  { key: "draft", label: "Drafts", tone: "gold" as const },
  { key: "posted", label: "Posted", tone: "green" as const },
];

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function channelChips(post: Post) {
  const chans = post.channels || [];
  if (!chans.length) return null;
  return (
    <div className="flex" style={{ gap: 4, flexWrap: "wrap" }}>
      {chans.map((c) => (
        <span key={c} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "var(--line-2)", color: "var(--muted)", fontWeight: 600 }}>{c}</span>
      ))}
    </div>
  );
}

export default function ContentBoard({ posts, mediaSigned }: { posts: Post[]; mediaSigned: Record<string, string> }) {
  const [open, setOpen] = useState<Post | null>(null);

  return (
    <>
      <div className="grid cols-3" style={{ gap: 14 }}>
        {COLS.map((col) => {
          const items = posts.filter((p) => p.status === col.key);
          return (
            <div className="card" key={col.key} style={{ display: "flex", flexDirection: "column", maxHeight: 540, minHeight: 280 }}>
              <div className="card-h" style={{ flexShrink: 0 }}>
                <span className="flex" style={{ gap: 8 }}>
                  <Badge tone={col.tone}>{col.label}</Badge>
                </span>
                <span className="disp2" style={{ fontWeight: 800, fontSize: 18 }}>{items.length}</span>
              </div>
              <div className="card-pad stack" style={{ overflowY: "auto", flex: 1, gap: 10 }}>
                {items.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Empty.</div>}
                {items.map((p) => {
                  const img = p.image_url ? mediaSigned[p.image_url] : null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOpen(p)}
                      style={{
                        textAlign: "left",
                        border: "1px solid var(--line)",
                        borderRadius: 12,
                        padding: 10,
                        background: "var(--surface)",
                        cursor: "pointer",
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        maxHeight: 170,
                        overflow: "hidden",
                      }}
                    >
                      <div className="between" style={{ width: "100%" }}>
                        <span className="flex" style={{ gap: 6 }}>
                          <Badge tone="purple">{p.brand?.name || "-"}</Badge>
                        </span>
                        {channelChips(p)}
                      </div>
                      {img && (
                        <img src={img} alt="" style={{ width: "100%", height: 60, objectFit: "cover", borderRadius: 8 }} />
                      )}
                      <div
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          display: "-webkit-box",
                          WebkitLineClamp: img ? 2 : 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {p.body || "(no copy)"}
                      </div>
                      <div className="muted" style={{ fontSize: 11, marginTop: "auto" }}>
                        {p.created_by === "AI" ? "✦AI · " : ""}
                        {p.scheduled_for ? `for ${shortDate(p.scheduled_for)}` : p.posted_at ? shortDate(p.posted_at) : "draft"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {open && <PostDrawer post={open} mediaSigned={mediaSigned} onClose={() => setOpen(null)} />}
    </>
  );
}

function PostDrawer({ post, mediaSigned, onClose }: { post: Post; mediaSigned: Record<string, string>; onClose: () => void }) {
  const [pending, start] = useTransition();
  const img = post.image_url ? mediaSigned[post.image_url] : null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 60 }} />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(480px, 92vw)",
          background: "var(--bg)",
          borderLeft: "1px solid var(--line)",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
          zIndex: 61,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header className="between" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <div className="flex" style={{ gap: 8 }}>
            <Badge tone="purple">{post.brand?.name || "-"}</Badge>
            <Badge tone={post.status === "posted" ? "green" : post.status === "scheduled" ? "blue" : "gold"}>{post.status}</Badge>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
            <X size={20} />
          </button>
        </header>

        <div style={{ overflowY: "auto", padding: 18, flex: 1 }}>
          {img && (
            <img src={img} alt="" style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: 12, marginBottom: 14 }} />
          )}
          <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{post.body || "(no copy)"}</div>

          <div className="stack" style={{ gap: 8, marginTop: 18, fontSize: 12.5 }}>
            {channelChips(post)}
            {post.social_accounts && Object.keys(post.social_accounts).length > 0 && (
              <div className="muted" style={{ fontSize: 11.5 }}>
                Accounts: {Object.entries(post.social_accounts).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ")}
              </div>
            )}
            <div className="muted" style={{ fontSize: 11.5 }}>
              {post.scheduled_for ? `Scheduled for ${shortDate(post.scheduled_for)}` : post.posted_at ? `Posted ${shortDate(post.posted_at)}` : "Draft"}
            </div>
          </div>

          {post.status !== "posted" && (
            <form
              action={(fd) => start(async () => { await rescheduleSubmit(fd); onClose(); })}
              style={{ marginTop: 20, padding: 14, border: "1px solid var(--line)", borderRadius: 12 }}
            >
              <input type="hidden" name="id" value={post.id} />
              <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>
                <Calendar size={13} style={{ verticalAlign: "middle" }} /> Reschedule
              </div>
              <div className="flex" style={{ gap: 8 }}>
                <input
                  type="datetime-local"
                  name="scheduled_for"
                  defaultValue={post.scheduled_for ? new Date(post.scheduled_for).toISOString().slice(0, 16) : ""}
                  style={{ flex: 1 }}
                />
                <button className="btn teal" type="submit" disabled={pending}>{pending ? "..." : "Save"}</button>
              </div>
            </form>
          )}
        </div>

        <footer className="flex" style={{ padding: 14, borderTop: "1px solid var(--line)", gap: 8, flexShrink: 0 }}>
          {post.status === "draft" && (
            <form action={(fd) => start(async () => { await setPostStatus(fd); onClose(); })}>
              <input type="hidden" name="id" value={post.id} />
              <input type="hidden" name="status" value="scheduled" />
              <button className="actionchip" type="submit" disabled={pending}><CheckCircle2 size={14} /> Move to scheduled</button>
            </form>
          )}
          {post.status === "scheduled" && (
            <form action={(fd) => start(async () => { await setPostStatus(fd); onClose(); })}>
              <input type="hidden" name="id" value={post.id} />
              <input type="hidden" name="status" value="posted" />
              <button className="actionchip" type="submit" disabled={pending}><CheckCircle2 size={14} /> Mark posted</button>
            </form>
          )}
          <form action={(fd) => start(async () => { await deletePost(fd); onClose(); })} style={{ marginLeft: "auto" }}>
            <input type="hidden" name="id" value={post.id} />
            <button className="pill" type="submit" disabled={pending} style={{ color: "var(--rose-700, #c0392b)" }}>
              <Trash2 size={13} /> Delete
            </button>
          </form>
        </footer>
      </aside>
    </>
  );
}
