"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTabs } from "./tabs-context";
import { Money } from "./Money";
import { issueInvoice } from "../app/reports/actions";
import type { InvoiceResult } from "../lib/invoice";
import {
  ReceiptText, Plus, Trash2, Loader2, Sparkles, Printer, Download, AlertTriangle,
} from "lucide-react";

// The invoice builder (R3-5 / P11, img 170). Issues an invoice TO another
// company: bill-to fields, line items (description / qty / unit price / amount),
// auto subtotal/tax/total, optional notes + terms, a chosen brand letterhead.
// The "from" side, the invoice number, and the issue date are filled by the
// server (org from the brain, auto-sequence, now()). On screen the totals render
// through the shared <Money> primitive; the saved invoice is branded printable
// HTML that opens in the FocusTab and exports to a real PDF via /api/studio/pdf.

const BRANDS = [
  { v: "nisria", l: "Nisria" },
  { v: "maisha", l: "Maisha" },
  { v: "ahadi", l: "AHADI" },
];

type Line = { description: string; qty: string; unitPrice: string };

const blankLine = (): Line => ({ description: "", qty: "1", unitPrice: "" });

export default function InvoiceBuilder() {
  const [brand, setBrand] = useState("nisria");
  const [company, setCompany] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [due, setDue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 30 days of the issue date.");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const router = useRouter();
  const { openSheet, closeSheet } = useTabs();

  const num = (s: string) => (isFinite(Number(s)) ? Number(s) : 0);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + num(l.qty) * num(l.unitPrice), 0);
    const rate = Math.max(0, num(taxRate));
    const tax = subtotal * (rate / 100);
    return { subtotal: Math.round(subtotal * 100) / 100, tax: Math.round(tax * 100) / 100, total: Math.round((subtotal + tax) * 100) / 100 };
  }, [lines, taxRate]);

  function setLine(i: number, key: keyof Line, val: string) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  }
  function addLine() { setLines((prev) => [...prev, blankLine()]); }
  function removeLine(i: number) { setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i))); }

  function printResult() {
    const win = iframeRef.current?.contentWindow;
    if (win) { win.focus(); win.print(); }
  }

  async function run() {
    if (busy) return;
    if (!company.trim()) { setError("Enter the company this invoice bills."); return; }
    const items = lines
      .map((l) => ({ description: l.description.trim(), qty: num(l.qty), unitPrice: num(l.unitPrice) }))
      .filter((l) => l.description && (l.qty > 0 || l.unitPrice > 0));
    if (!items.length) { setError("Add at least one line item with a description and amount."); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await issueInvoice({
        brand,
        billToCompany: company.trim(),
        billToContact: contact.trim() || undefined,
        billToAddress: address.trim() || undefined,
        billToEmail: email.trim() || undefined,
        dueDate: due || null,
        currency,
        items,
        taxRate: Math.max(0, num(taxRate)),
        notes: notes.trim() || undefined,
        terms: terms.trim() || undefined,
      });
      if (res.ok && res.html) {
        openResult(res);
        // reset the bill-to + lines for the next invoice; keep brand/terms
        setCompany(""); setContact(""); setAddress(""); setEmail(""); setDue(""); setNotes("");
        setLines([blankLine()]);
        router.refresh();
      } else {
        setError(res.error || "Could not create the invoice.");
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function openResult(res: InvoiceResult) {
    const id = `invoice-result:${res.invoiceId || Date.now()}`;
    openSheet({
      id,
      title: (res.invoiceNumber || "Invoice").slice(0, 28),
      icon: "dollar",
      titleExtra: <span className="badge teal" style={{ fontSize: 10 }}>branded · issued</span>,
      render: () => (
        <>
          <iframe
            ref={iframeRef}
            title="Invoice preview"
            sandbox="allow-same-origin allow-modals"
            srcDoc={res.html}
            style={{ width: "100%", height: "66vh", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}
          />
          <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
            Saved to your invoices and Library as {res.invoiceNumber}. Download a PDF or print to send it.
          </div>
        </>
      ),
      footer: (
        <>
          {res.docId && <a className="btn teal sm" href={`/api/studio/pdf?id=${res.docId}`} target="_blank" rel="noopener"><Download size={13} /> Download PDF</a>}
          <button type="button" className="btn ghost sm" onClick={printResult}><Printer size={13} /> Print</button>
          <button type="button" className="btn ghost sm" onClick={() => closeSheet(id)}>Close</button>
        </>
      ),
    });
  }

  return (
    <div className="card" id="invoice-builder">
      <div className="card-h">
        <span className="flex"><ReceiptText size={15} /> Issue an invoice</span>
        <span className="badge gold" style={{ fontSize: 10 }}>to another company</span>
      </div>
      <div className="card-pad stack" style={{ gap: 16 }}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          Bill another company on your letterhead. The invoice number, issue date, and the from details are filled automatically; you add the bill-to and the line items.
        </div>

        {/* bill-to */}
        <div>
          <div className="report-subhead" style={{ marginBottom: 8 }}>Bill to</div>
          <div className="stack" style={{ gap: 8 }}>
            <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" disabled={busy} />
            <div className="flex" style={{ gap: 8, flexWrap: "wrap" }}>
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contact person (optional)" disabled={busy} style={{ flex: 1, minWidth: 180 }} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Billing email (optional)" disabled={busy} style={{ flex: 1, minWidth: 180 }} />
            </div>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Billing address (optional)" disabled={busy} />
          </div>
        </div>

        {/* line items */}
        <div>
          <div className="report-subhead" style={{ marginBottom: 8 }}>Line items</div>
          <div className="stack" style={{ gap: 8 }}>
            {lines.map((l, i) => (
              <div key={i} className="flex" style={{ gap: 8, alignItems: "center" }}>
                <input value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} placeholder="Description" disabled={busy} style={{ flex: 1, minWidth: 140 }} />
                <input value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} placeholder="Qty" inputMode="decimal" disabled={busy} style={{ width: 64 }} />
                <input value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} placeholder="Unit price" inputMode="decimal" disabled={busy} style={{ width: 96 }} />
                <span className="money-amt" style={{ width: 92, textAlign: "right", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                  <Money amount={num(l.qty) * num(l.unitPrice)} currency={currency} />
                </span>
                <button type="button" className="icon-btn tip-host" data-tip="Remove line" onClick={() => removeLine(i)} disabled={busy || lines.length === 1} aria-label="Remove line">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="actionchip" onClick={addLine} disabled={busy} style={{ alignSelf: "flex-start", fontSize: 11.5 }}>
              <Plus size={12} /> Add line
            </button>
          </div>
        </div>

        {/* totals + meta */}
        <div className="flex wrap" style={{ gap: 16, alignItems: "flex-start", justifyContent: "space-between" }}>
          <div className="flex wrap" style={{ gap: 12, alignItems: "flex-end" }}>
            <label className="stack" style={{ gap: 4, fontSize: 11.5 }}>
              <span className="faint">Letterhead</span>
              <select value={brand} onChange={(e) => setBrand(e.target.value)} disabled={busy} style={{ width: "auto", minWidth: 120 }}>
                {BRANDS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
              </select>
            </label>
            <label className="stack" style={{ gap: 4, fontSize: 11.5 }}>
              <span className="faint">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={busy} style={{ width: 90 }}>
                <option value="USD">USD</option>
                <option value="KES">KES</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </label>
            <label className="stack" style={{ gap: 4, fontSize: 11.5 }}>
              <span className="faint">Tax %</span>
              <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" disabled={busy} style={{ width: 70 }} />
            </label>
            <label className="stack" style={{ gap: 4, fontSize: 11.5 }}>
              <span className="faint">Due date</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={busy} />
            </label>
          </div>
          <div className="stack" style={{ gap: 4, fontSize: 13, minWidth: 180 }}>
            <div className="between"><span className="muted">Subtotal</span><Money amount={totals.subtotal} currency={currency} /></div>
            {num(taxRate) > 0 && <div className="between"><span className="muted">Tax ({num(taxRate)}%)</span><Money amount={totals.tax} currency={currency} /></div>}
            <div className="between" style={{ fontWeight: 700, fontSize: 15, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              <span>Total</span><Money amount={totals.total} currency={currency} />
            </div>
          </div>
        </div>

        {/* notes + terms */}
        <div className="flex wrap" style={{ gap: 10 }}>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 220, fontSize: 11.5 }}>
            <span className="faint">Notes (optional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={busy} />
          </label>
          <label className="stack" style={{ gap: 4, flex: 1, minWidth: 220, fontSize: 11.5 }}>
            <span className="faint">Payment terms</span>
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} disabled={busy} />
          </label>
        </div>

        <div className="flex" style={{ gap: 10, alignItems: "center" }}>
          <button type="button" className="btn teal" onClick={run} disabled={busy || !company.trim()}>
            {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
            {busy ? "Issuing…" : "Create invoice"}
          </button>
          {error && (
            <span className="flex" style={{ gap: 6, color: "var(--danger)", fontSize: 12.5 }}>
              <AlertTriangle size={14} /> {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
