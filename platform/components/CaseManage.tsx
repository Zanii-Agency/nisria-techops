"use client";

// Owner controls for a case (Nur). She owns these records, so she can EDIT (fix the
// name, dependents, needs, region), MERGE this case into another (fold a child the
// bot logged separately back into the parent's family), or DELETE it outright. All
// three are real server actions, guarded to cases only. Opens from a quiet "manage"
// button on the case card.
import { useState } from "react";
import Modal from "./Modal";
import { editCase, mergeCase, deleteCase, askOwnerAboutCase } from "../app/cases/actions";
import { Pencil, GitMerge, Trash2, MoreHorizontal, MessageCircleQuestion } from "lucide-react";

type Other = { id: string; name: string };

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--muted)", display: "block", marginBottom: 4 };

export default function CaseManage({ c, others, hint }: { c: any; others: Other[]; hint?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"edit" | "merge" | "delete">("edit");
  const deps = (() => { const m = String(c.triage_notes || "").match(/Dependents:\s*(.*)/i); return m ? m[1].trim() : ""; })();

  return (
    <>
      <button className="iconbtn sm" aria-label="Manage case" title="Manage: edit, merge, or delete" onClick={() => setOpen(true)}>
        <MoreHorizontal size={15} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} width={460} title={`Manage ${c.full_name || "case"}`}>
        <div className="flex" style={{ gap: 6, marginBottom: 14 }}>
          <button className={`pill ${tab === "edit" ? "on" : ""}`} onClick={() => setTab("edit")}><Pencil size={12} /> Edit</button>
          <button className={`pill ${tab === "merge" ? "on" : ""}`} onClick={() => setTab("merge")}><GitMerge size={12} /> Merge</button>
          <button className={`pill ${tab === "delete" ? "on" : ""}`} onClick={() => setTab("delete")}><Trash2 size={12} /> Delete</button>
        </div>

        {tab === "edit" && (
          <form action={editCase} className="stack" style={{ gap: 11 }} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={c.id} />
            <div><span style={lbl}>Name</span><input name="full_name" defaultValue={c.full_name || ""} style={{ width: "100%" }} /></div>
            <div><span style={lbl}>Dependents (comma separated)</span><input name="dependents" defaultValue={deps} placeholder="Princess, Tony" style={{ width: "100%" }} /></div>
            <div><span style={lbl}>Needs</span><textarea name="needs" defaultValue={c.needs || ""} rows={2} style={{ width: "100%" }} /></div>
            <div><span style={lbl}>Region</span><input name="region" defaultValue={c.region || c.location || ""} style={{ width: "100%" }} /></div>
            <button className="btn teal" type="submit">Save changes</button>
          </form>
        )}

        {tab === "merge" && (
          <form action={mergeCase} className="stack" style={{ gap: 11 }} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={c.id} />
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              Fold <b>{c.full_name}</b> into another case as a dependent, then remove this separate card. Use this when the bot logged a child who belongs to a parent's family.
            </div>
            <div>
              <span style={lbl}>Merge into</span>
              <select name="into" required defaultValue="" style={{ width: "100%" }}>
                <option value="" disabled>Pick the parent case…</option>
                {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <button className="btn teal" type="submit"><GitMerge size={14} /> Merge into family</button>
          </form>
        )}

        {tab === "delete" && (
          <form action={deleteCase} className="stack" style={{ gap: 11 }} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={c.id} />
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              Permanently remove <b>{c.full_name}</b>'s case. This cannot be undone. Use it for a duplicate or a mistaken intake.
            </div>
            <button className="btn" type="submit" style={{ background: "var(--danger)", color: "#fff", border: "none" }}><Trash2 size={14} /> Delete case</button>
          </form>
        )}

        {/* Not sure? hand the decision to Nur over WhatsApp; she resolves it here. */}
        <form action={askOwnerAboutCase} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }} onSubmit={() => setOpen(false)}>
          <input type="hidden" name="id" value={c.id} />
          {hint && <input type="hidden" name="hint" value={hint} />}
          <button className="btn ghost sm" type="submit" title="Send Nur a WhatsApp asking what to do with this case">
            <MessageCircleQuestion size={14} /> Ask Nur to decide
          </button>
        </form>
      </Modal>
    </>
  );
}
