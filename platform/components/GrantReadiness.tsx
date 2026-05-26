"use client";

import { useMemo, useRef, useState, useTransition, useEffect } from "react";
import {
  ClipboardCheck,
  FileText,
  Sparkles,
  RefreshCw,
  Loader2,
  Maximize2,
  Printer,
  NotebookPen,
  Wand2,
} from "lucide-react";
import Modal from "./Modal";
import { Badge } from "./ui";
import { BRAIN_ICONS, SectionRow } from "./BrainOnboarding";
import { GRANT_SECTIONS, groupCompleteness, type SectionKey } from "../lib/brain";
import { GRANT_DOC_SPECS } from "../lib/grant-docs";
import { queueGrantDoc, queueAllGrantDocs, getGrantDocStatus } from "../app/settings/actions";

type SavedMap = Record<string, string>;
type GrantDoc = {
  id: string;
  kind: string;
  title: string;
  doc_type?: string | null;
  created_at?: string | null;
  html: string;
};

// Grant readiness (R2-4 / #37). Two halves, both inside Settings:
//  1. The grant-readiness onboarding group: the standard inputs funders require
//     (legal, financials, impact, leadership, narrative). Reuses SectionRow so it
//     saves each field independently to org_profile + agent_memory (org_fact).
//  2. The "Grant-ready documents" panel: generate / regenerate the four standard
//     funder documents from those facts. Generation is NON-BLOCKING (enqueues a
//     background job + detached worker), so the click never freezes the page.
export default function GrantReadiness({
  saved,
  docs,
  initialStatus,
}: {
  saved: SavedMap;
  docs: GrantDoc[];
  initialStatus: Record<string, number>;
}) {
  const firstEmpty = GRANT_SECTIONS.find((s) => !(saved[s.key] || "").trim())?.key ?? GRANT_SECTIONS[0].key;
  const [open, setOpen] = useState<SectionKey | null>(firstEmpty);
  const [filledLocal, setFilledLocal] = useState<Record<string, boolean>>(
    Object.fromEntries(GRANT_SECTIONS.map((s) => [s.key, !!(saved[s.key] || "").trim()]))
  );
  const completeness = useMemo(() => groupCompleteness("grant", filledLocal), [filledLocal]);
  const anyFacts = completeness.done > 0;

  // newest doc per kind (the panel shows the canonical latest of each)
  const latestByKind = useMemo(() => {
    const m: Record<string, GrantDoc> = {};
    for (const d of docs) if (!m[d.kind]) m[d.kind] = d; // docs already newest-first
    return m;
  }, [docs]);

  // open-generate-job counts per doc kind (quiet "preparing" chip)
  const [status, setStatus] = useState<Record<string, number>>(initialStatus || {});
  const anyPreparing = Object.values(status).some((n) => n > 0);

  // poll the status while anything is preparing (cheap count query). Stops when
  // the queue is clear. Never drives navigation; only updates a chip.
  useEffect(() => {
    if (!anyPreparing) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const s = await getGrantDocStatus();
        if (alive) setStatus(s);
      } catch {}
    }, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [anyPreparing]);

  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<GrantDoc | null>(null);

  function generate(kind: string) {
    setStatus((s) => ({ ...s, [kind]: (s[kind] || 0) + 1 })); // optimistic chip
    start(async () => {
      await queueGrantDoc(kind as any);
      try { setStatus(await getGrantDocStatus()); } catch {}
    });
  }
  function generateAll() {
    setStatus((s) => {
      const next = { ...s };
      for (const spec of GRANT_DOC_SPECS) next[spec.kind] = (next[spec.kind] || 0) + 1;
      return next;
    });
    start(async () => {
      await queueAllGrantDocs();
      try { setStatus(await getGrantDocStatus()); } catch {}
    });
  }

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="card-h">
        <span className="flex">
          <ClipboardCheck size={16} /> Grant readiness
        </span>
        <span className="badge teal">
          {completeness.done} of {completeness.total} captured
        </span>
      </div>

      <div className="card-pad stack" style={{ gap: 18 }}>
        <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
          Funders almost always ask for the same things: who you are on paper, your money, your impact,
          your people, and your story. Capture them once here and the portal grounds every grant it
          prepares in your real facts, and can produce the standard documents funders want, ready to
          attach. Fill in what you can. Rough numbers and links are fine, nothing here is ever required.
        </p>

        {/* the grant-readiness onboarding group */}
        <div className="stack" style={{ gap: 10 }}>
          {GRANT_SECTIONS.map((s) => {
            const Icon = BRAIN_ICONS[s.icon] || NotebookPen;
            return (
              <SectionRow
                key={s.key}
                sectionKey={s.key}
                label={s.label}
                blurb={s.blurb}
                placeholder={s.placeholder}
                Icon={Icon}
                isOpen={open === s.key}
                isFilled={!!filledLocal[s.key]}
                initial={saved[s.key] || ""}
                onToggle={() => setOpen(open === s.key ? null : s.key)}
                onSaved={(hasContent) => setFilledLocal((m) => ({ ...m, [s.key]: hasContent }))}
              />
            );
          })}
        </div>

        {/* ---- Grant-ready documents panel ---- */}
        <div
          className="stack"
          style={{ gap: 12, paddingTop: 16, borderTop: "1px solid var(--line)" }}
        >
          <div className="between">
            <span className="flex" style={{ gap: 8 }}>
              <span className="aico teal" style={{ width: 30, height: 30, borderRadius: 9 }}>
                <Wand2 size={15} />
              </span>
              <span className="stack" style={{ gap: 1 }}>
                <span className="strong" style={{ fontSize: 13.5 }}>Grant-ready documents</span>
                <span className="faint" style={{ fontSize: 11.5 }}>
                  The standard set funders ask for, built from the facts above.
                </span>
              </span>
            </span>
            <button
              type="button"
              className="btn teal sm"
              onClick={generateAll}
              disabled={pending || !anyFacts}
              title={anyFacts ? "Generate the whole set" : "Add some facts above first"}
            >
              <Sparkles size={13} /> Generate all
            </button>
          </div>

          {!anyFacts && (
            <div className="faint" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Capture at least one section above and the documents will be grounded in your real
              information. You can still generate them, but they will lean on placeholders.
            </div>
          )}

          <div className="grid cols-2" style={{ gap: 12 }}>
            {GRANT_DOC_SPECS.map((spec) => {
              const doc = latestByKind[spec.kind];
              const preparing = (status[spec.kind] || 0) > 0;
              return (
                <div
                  key={spec.kind}
                  className="card"
                  style={{ boxShadow: "none", border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface)" }}
                >
                  <div className="card-pad stack" style={{ gap: 10 }}>
                    <div className="flex" style={{ gap: 10, minWidth: 0 }}>
                      <span className="aico teal" style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}>
                        <FileText size={15} />
                      </span>
                      <span className="stack" style={{ gap: 1, minWidth: 0 }}>
                        <span className="strong" style={{ fontSize: 13 }}>{spec.title}</span>
                        <span className="faint" style={{ fontSize: 11 }}>
                          {doc
                            ? `Ready · ${doc.created_at ? new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "saved"}`
                            : "Not generated yet"}
                        </span>
                      </span>
                    </div>

                    <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
                      {preparing ? (
                        <span className="badge teal flex" style={{ gap: 5 }}>
                          <Loader2 size={11} className="spin" /> preparing
                        </span>
                      ) : doc ? (
                        <Badge tone="green">ready</Badge>
                      ) : (
                        <Badge tone="gray">empty</Badge>
                      )}

                      {doc && !preparing && (
                        <button type="button" className="btn ghost sm" onClick={() => setPreview(doc)}>
                          <Maximize2 size={12} /> Open
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => generate(spec.kind)}
                        disabled={pending || preparing}
                        style={{ marginLeft: "auto" }}
                      >
                        {doc ? <><RefreshCw size={12} /> Regenerate</> : <><Sparkles size={12} /> Generate</>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
            Documents are saved to your Library and reachable when preparing a grant. Generation runs in
            the background, so you can keep working or leave this page while a document is prepared.
          </div>
        </div>
      </div>

      {/* preview a generated doc in the shared centered modal */}
      <DocPreview doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function DocPreview({ doc, onClose }: { doc: GrantDoc | null; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  function printIt() {
    const win = iframeRef.current?.contentWindow;
    if (win) { win.focus(); win.print(); }
  }
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      width={860}
      title={<div className="flex wrap"><h3 style={{ fontSize: 18 }}>{doc?.title || "Document"}</h3><span className="badge teal" style={{ fontSize: 10 }}>grant-ready · branded</span></div>}
      footer={
        <>
          <button type="button" className="btn teal sm" onClick={printIt}><Printer size={13} /> Print / Save as PDF</button>
          <button type="button" className="btn ghost sm" onClick={onClose}>Close</button>
        </>
      }
    >
      {doc?.html && (
        <iframe
          ref={iframeRef}
          title={doc.title}
          sandbox="allow-same-origin allow-modals"
          srcDoc={doc.html}
          style={{ width: "100%", height: "62vh", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}
        />
      )}
    </Modal>
  );
}
