import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "../../../../components/Shell";
import ConfirmButton from "../../../../components/ConfirmButton";
import { admin } from "../../../../lib/supabase-admin";
import { updateDocument, deleteDocument } from "../../actions";

export const dynamic = "force-dynamic";

// Owner CRUD (2026-07-23). Nur corrects how a Drive-extracted document was filed:
// title, folder/subfolder, type, brand, summary. Follows the inventory edit-page
// pattern (server-action form, pre-filled, no client state). See app/filing/actions.ts
// for why "delete" is the remove path (documents has no status/archived column).
const TYPE_OPTIONS: [string, string][] = [
  ["bank_statement", "Bank statement"], ["invoice", "Invoice"], ["receipt", "Receipt"],
  ["contract", "Contract"], ["budget", "Budget"], ["expenses", "Expenses"], ["registration", "Registration"],
  ["policy", "Policy"], ["grant", "Grant"], ["report", "Report"], ["database", "Database"],
  ["spreadsheet", "Spreadsheet"], ["presentation", "Deck"], ["document", "Document"],
];

function bytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function EditDocument({ params }: { params: { id: string } }) {
  const db = admin();
  // never select extracted_text here — it can run 200k chars/row, this page only needs metadata
  const { data: doc } = await db
    .from("documents")
    .select("id,title,folder,subfolder,doc_type,brand,mime,size_bytes,drive_url,doc_date,modified_at,summary")
    .eq("id", params.id)
    .single();
  if (!doc) notFound();

  const backHref = `/filing?folder=${encodeURIComponent(doc.folder || "General")}`;
  const typeKnown = TYPE_OPTIONS.some(([v]) => v === (doc.doc_type || ""));

  return (
    <Shell
      title={`Edit ${doc.title || "document"}`}
      sub={doc.folder || "Filing"}
      action={<Link href={backHref} className="btn ghost sm">Cancel</Link>}
    >
      <div className="stack" style={{ gap: 16, maxWidth: 620 }}>
        <div className="card card-pad stack" style={{ gap: 4 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>
            Source file <span className="faint" style={{ fontWeight: 400 }}>· read-only, from Drive</span>
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            {doc.mime || "—"}{doc.size_bytes ? ` · ${bytes(doc.size_bytes)}` : ""}
          </div>
          {doc.drive_url && (
            <a href={doc.drive_url} target="_blank" rel="noreferrer" className="faint" style={{ fontSize: 12 }}>
              Open original in Drive ↗
            </a>
          )}
        </div>

        <form action={updateDocument} className="stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={doc.id} />

          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Details</div>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Title</span>
              <input name="title" defaultValue={doc.title || ""} />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Folder</span>
              <input name="folder" defaultValue={doc.folder || ""} placeholder="e.g. Finance" />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Subfolder</span>
              <input name="subfolder" defaultValue={doc.subfolder || ""} placeholder="e.g. 2026 statements" />
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Type</span>
              <select name="doc_type" defaultValue={doc.doc_type || ""}>
                <option value="">—</option>
                {TYPE_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                {!typeKnown && doc.doc_type && <option value={doc.doc_type}>{doc.doc_type}</option>}
              </select>
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Brand</span>
              <select name="brand" defaultValue={doc.brand || ""}>
                <option value="">—</option>
                <option value="nisria">Nisria</option>
                <option value="maisha">Maisha</option>
                <option value="ahadi">AHADI</option>
              </select>
            </label>
            <label className="stack" style={{ gap: 4 }}>
              <span className="muted" style={{ fontSize: 12 }}>Summary / notes</span>
              <textarea name="summary" defaultValue={doc.summary || ""} rows={5} />
            </label>
          </div>

          <div className="between" style={{ marginTop: 4 }}>
            <ConfirmButton
              formAction={deleteDocument}
              className="btn ghost"
              confirm={`Remove "${doc.title || "this document"}" from Filing? The original file in Drive is not touched.`}
              style={{ color: "var(--danger)" }}
            >
              Remove from Filing
            </ConfirmButton>
            <div className="flex" style={{ gap: 8 }}>
              <Link href={backHref} className="btn ghost">Cancel</Link>
              <button type="submit" className="btn teal">Save changes</button>
            </div>
          </div>
        </form>
      </div>
    </Shell>
  );
}
