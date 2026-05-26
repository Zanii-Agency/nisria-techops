// The embedder SEAM. Memory is full-text today and that is fine. This module is
// the single place semantic search turns on later: drop in a Voyage / OpenAI key
// (or point at the DGX), and remember() starts storing vectors + recall() starts
// ranking by cosine similarity. With NO key configured, embed() returns null and
// the whole stack transparently falls back to the existing tsvector full-text.
//
// Zero rework to flip on: only env + (optionally) one ivfflat index once rows
// have embeddings. The agent_memory.embedding column (vector(1536)) already
// exists in the spine schema.

// Dimension the agent_memory.embedding column was created with. Keep providers
// that match this (Voyage voyage-3 / voyage-3-lite = 1024 by default but support
// 1536 via output_dimension; OpenAI text-embedding-3-small = 1536). If a future
// provider differs, alter the column once and bump this.
export const EMBED_DIM = 1536;

type Provider = "voyage" | "openai" | "none";

function provider(): Provider {
  // explicit override wins
  const p = (process.env.EMBEDDER_PROVIDER || "").toLowerCase();
  if (p === "voyage" && process.env.VOYAGE_API_KEY) return "voyage";
  if (p === "openai" && process.env.OPENAI_API_KEY) return "openai";
  // otherwise infer from whichever key is present
  if (process.env.VOYAGE_API_KEY) return "voyage";
  if (process.env.OPENAI_API_KEY) return "openai";
  // generic seam: EMBEDDER_API_KEY + EMBEDDER_URL (OpenAI-compatible) for the DGX
  if (process.env.EMBEDDER_API_KEY && process.env.EMBEDDER_URL) return "openai";
  return "none";
}

// True when something can produce vectors. Cheap to call; lets callers branch
// (e.g. recall) without attempting a network round-trip first.
export function embedderConfigured(): boolean {
  return provider() !== "none";
}

// Returns a unit-length-ish embedding, or null when no embedder is configured or
// on any failure. NEVER throws into the caller: a dead embedder must degrade to
// full-text, not break remember()/recall().
export async function embed(text: string): Promise<number[] | null> {
  const prov = provider();
  if (prov === "none") return null;
  const input = (text || "").trim().slice(0, 8000);
  if (!input) return null;

  try {
    if (prov === "voyage") {
      const r = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.EMBEDDER_MODEL || "voyage-3",
          input,
          output_dimension: EMBED_DIM,
        }),
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "voyage embed failed");
      const v = j?.data?.[0]?.embedding;
      return Array.isArray(v) && v.length ? v : null;
    }

    // openai-compatible (OpenAI proper, or self-hosted DGX via EMBEDDER_URL)
    const url = process.env.EMBEDDER_URL || "https://api.openai.com/v1/embeddings";
    const key = process.env.OPENAI_API_KEY || process.env.EMBEDDER_API_KEY || "";
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.EMBEDDER_MODEL || "text-embedding-3-small",
        input,
        dimensions: EMBED_DIM,
      }),
      cache: "no-store",
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "openai embed failed");
    const v = j?.data?.[0]?.embedding;
    return Array.isArray(v) && v.length ? v : null;
  } catch (err) {
    console.error("embed failed (falling back to full-text)", err);
    return null;
  }
}

// pgvector literal for an embedding column: "[0.1,0.2,...]". Used by recall when
// embeddings exist, via the match_memory RPC.
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
