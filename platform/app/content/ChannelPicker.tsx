"use client";
import { useState, useMemo } from "react";
import { Instagram, Facebook, Linkedin } from "lucide-react";

// Lucide doesn't ship a TikTok icon. Tiny inline SVG matches the stroke weight of the others.
function TikTokIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
    </svg>
  );
}

export type Brand = {
  id: string;
  name: string;
  slug?: string;
  tiktok_handles?: string[] | null;
  linkedin_account?: string | null;
  instagram_account?: string | null;
  facebook_account?: string | null;
};

const BASE_CHANNELS = [
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "facebook", label: "Facebook", Icon: Facebook },
  { key: "tiktok", label: "TikTok", Icon: TikTokIcon },
  { key: "linkedin", label: "LinkedIn", Icon: Linkedin },
] as const;

export default function ChannelPicker({ brands, defaultBrandId }: { brands: Brand[]; defaultBrandId?: string }) {
  const [brandId, setBrandId] = useState<string>(defaultBrandId || brands[0]?.id || "");
  const [picked, setPicked] = useState<Record<string, boolean>>({ instagram: true, facebook: true });
  const [tiktokHandles, setTiktokHandles] = useState<string[]>([]);

  const brand = useMemo(() => brands.find((b) => b.id === brandId), [brandId, brands]);
  const tiktokAvailable = brand?.tiktok_handles || [];
  const linkedinAccount = brand?.linkedin_account || null;

  function toggle(k: string) {
    setPicked((p) => ({ ...p, [k]: !p[k] }));
  }
  function toggleHandle(h: string) {
    setTiktokHandles((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]));
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="flex" style={{ flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label className="stack" style={{ gap: 5 }}>
          <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>Brand</span>
          <select name="brand_id" value={brandId} onChange={(e) => { setBrandId(e.target.value); setTiktokHandles([]); }} style={{ maxWidth: 200 }}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 5 }}>
          <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>Schedule for</span>
          <input type="datetime-local" name="scheduled_for" style={{ maxWidth: 230 }} />
        </label>
        <div className="stack" style={{ gap: 5 }}>
          <span className="muted" style={{ fontSize: 11.5, fontWeight: 600 }}>Channels</span>
          <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
            {BASE_CHANNELS.map(({ key, label, Icon }) => {
              const on = !!picked[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex"
                  aria-pressed={on}
                  style={{
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: on ? "1.5px solid var(--teal-700)" : "1px solid var(--line-2)",
                    background: on ? "var(--teal-50)" : "var(--surface)",
                    color: on ? "var(--teal-900)" : "var(--ink)",
                    fontWeight: 600,
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  <Icon size={14} /> {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hidden inputs that the form posts. We mirror UI state here. */}
      {Object.entries(picked).filter(([, v]) => v).map(([k]) => (
        <input key={k} type="hidden" name="channels" value={k} />
      ))}
      {tiktokHandles.map((h) => (
        <input key={h} type="hidden" name="tiktok_handles" value={h} />
      ))}
      {picked.linkedin && linkedinAccount && (
        <input type="hidden" name="linkedin_account" value={linkedinAccount} />
      )}
      {picked.instagram && brand?.instagram_account && (
        <input type="hidden" name="instagram_account" value={brand.instagram_account} />
      )}
      {picked.facebook && brand?.facebook_account && (
        <input type="hidden" name="facebook_account" value={brand.facebook_account} />
      )}

      {picked.tiktok && (
        <div className="card-pad" style={{ background: "var(--teal-50)", borderRadius: 10, padding: 12 }}>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>
            TikTok handles for {brand?.name || "this brand"}
          </div>
          {tiktokAvailable.length === 0 ? (
            <div className="muted" style={{ fontSize: 12 }}>
              No TikTok handles configured. Add them under Settings, then they appear here.
            </div>
          ) : (
            <div className="flex" style={{ flexWrap: "wrap", gap: 8 }}>
              {tiktokAvailable.map((h) => {
                const on = tiktokHandles.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHandle(h)}
                    aria-pressed={on}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 6,
                      border: on ? "1.5px solid var(--teal-700)" : "1px solid var(--line)",
                      background: on ? "var(--teal-100)" : "var(--surface)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          )}
          {picked.tiktok && tiktokAvailable.length > 0 && tiktokHandles.length === 0 && (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Tip: pick one or more handles to fan this post out across them.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
