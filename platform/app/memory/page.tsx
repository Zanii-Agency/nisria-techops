import Shell from "../../components/Shell";
import { Badge } from "../../components/ui";
import { admin, date } from "../../lib/supabase-admin";
import DispatchBox from "../../components/DispatchBox";

export const dynamic = "force-dynamic";

// The memory window. A read-only view of the shared Brain: what Sasa knows, who
// and what it knows about (the entity graph), and the contradictions the librarian
// flagged for a human to resolve. Curation itself runs in /api/cron/librarian.
// You can ask the Brain in plain words via the dispatch box (Sasa's query_memory).
const KIND_LABEL: Record<string, string> = {
  org_fact: "Org facts",
  owner_private: "Owner private",
  auto_fact: "Learned (auto)",
  brand_voice: "Brand voice",
};

export default async function Memory() {
  const db = admin();
  const [{ data: factRows }, { data: entRows }, { data: linkRows }, { data: runRows }] = await Promise.all([
    db.from("agent_memory").select("id,kind,title,content,status,review_note,topic,created_at").order("created_at", { ascending: false }).limit(500),
    db.from("memory_entities").select("id,type,name,summary").order("name", { ascending: true }).limit(300),
    db.from("memory_entity_links").select("entity_id").limit(2000),
    db.from("memory_curation_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);
  const facts = (factRows || []) as any[];
  const entities = (entRows || []) as any[];
  const links = (linkRows || []) as any[];
  const lastRun = (runRows || [])[0] as any;

  const active = facts.filter((f) => f.status === "active");
  const review = facts.filter((f) => f.status === "needs_review");
  const superseded = facts.filter((f) => f.status === "superseded");
  const linkCount: Record<string, number> = {};
  for (const l of links) linkCount[l.entity_id] = (linkCount[l.entity_id] || 0) + 1;

  const byKind: Record<string, any[]> = {};
  for (const f of active) (byKind[f.kind] ||= []).push(f);

  const runSub = lastRun
    ? `last curated ${date(lastRun.started_at)} · ${lastRun.merged || 0} merged, ${lastRun.flagged || 0} flagged, ${lastRun.entities_upserted || 0} entities`
    : "not yet curated";

  return (
    <Shell title="Memory" sub={`${active.length} active facts · ${entities.length} entities · ${runSub}`}>
      <DispatchBox />

      {review.length > 0 && (
        <div className="card" style={{ marginTop: 16, borderColor: "var(--warn, #b45309)" }}>
          <div className="card-h">Needs your review <Badge tone="blue">{review.length}</Badge></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="muted" style={{ fontSize: 12.5 }}>The librarian found facts that contradict each other. It did not merge them. Tell Sasa the correct version to resolve.</div>
            {review.map((f) => (
              <div key={f.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div className="strong" style={{ fontSize: 13.5 }}>{f.title || f.topic || "(untitled)"}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{f.content}</div>
                {f.review_note && <div style={{ fontSize: 12, marginTop: 6, color: "var(--warn, #b45309)" }}>Conflict: {f.review_note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-h">What the Brain knows</div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.keys(byKind).length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>No facts stored yet.</div>}
            {Object.entries(byKind).map(([kind, list]) => (
              <div key={kind}>
                <div className="between" style={{ marginBottom: 6 }}>
                  <span className="strong" style={{ fontSize: 12.5 }}>{KIND_LABEL[kind] || kind}</span>
                  <Badge>{list.length}</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.slice(0, 12).map((f) => (
                    <div key={f.id} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                      {f.title && <span className="strong">{f.title}: </span>}
                      <span className="muted">{f.content}</span>
                    </div>
                  ))}
                  {list.length > 12 && <div className="muted" style={{ fontSize: 11.5 }}>+ {list.length - 12} more</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-h">Entity graph <Badge>{entities.length}</Badge></div>
          <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entities.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>The librarian builds this on its next run.</div>}
            {entities.map((e) => (
              <div key={e.id} className="between" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
                <div>
                  <span className="strong" style={{ fontSize: 12.5 }}>{e.name}</span>
                  <Badge tone="blue">{e.type}</Badge>
                  {e.summary && <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{e.summary}</div>}
                </div>
                <span className="muted" style={{ fontSize: 11.5 }}>{linkCount[e.id] || 0} facts</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {superseded.length > 0 && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
          {superseded.length} duplicate fact(s) consolidated and retired by the librarian.
        </div>
      )}
    </Shell>
  );
}
