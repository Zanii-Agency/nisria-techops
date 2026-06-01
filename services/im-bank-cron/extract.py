#!/usr/bin/env python3
# I&M Bank -> bank_transactions, SCHEDULED (Railway cron). Runs daily, headless.
#
# Pulls I&M monthly Account Statements from sasa@nisria.co (Gmail API, service
# account + domain-wide delegation), decrypts, parses each NEW statement with
# Claude under a hard balance-chain reconciliation gate, dedups on the bank's own
# ref, and upserts into bank_transactions. Idempotent: already-imported statements
# (by source_doc_id) are skipped, so a daily run only Claude-parses statements that
# arrived since the last run (usually zero, one or two at month-end). All creds
# come from ENV (no local files), so it runs anywhere.
#
# Env: GOOGLE_SERVICE_ACCOUNT_B64, GMAIL_IMPERSONATE, ANTHROPIC_API_KEY,
#      SUPABASE_URL, SUPABASE_SERVICE_KEY, IM_PDF_PW
import base64, io, json, os, sys, re, hashlib, urllib.request
from google.oauth2 import service_account
from googleapiclient.discovery import build
from pypdf import PdfReader, PdfWriter

def env(k, required=True):
    v = os.environ.get(k, "")
    if required and not v:
        print(f"FATAL: missing env {k}", file=sys.stderr); sys.exit(1)
    return v

SA_INFO = json.loads(base64.b64decode(env("GOOGLE_SERVICE_ACCOUNT_B64")))
SUBJECT = os.environ.get("GMAIL_IMPERSONATE", "sasa@nisria.co")
PW = env("IM_PDF_PW")
ANTHROPIC = env("ANTHROPIC_API_KEY")
SB_URL = env("SUPABASE_URL").rstrip("/"); SB_KEY = env("SUPABASE_SERVICE_KEY")
MODEL = os.environ.get("PARSE_MODEL", "claude-opus-4-8")
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
SBH = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}

creds = service_account.Credentials.from_service_account_info(SA_INFO, scopes=SCOPES, subject=SUBJECT)
gm = build("gmail", "v1", credentials=creds, cache_discovery=False)

def sb(method, path, body=None, extra=None):
    h = dict(SBH);
    if extra: h.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(SB_URL + path, data=data, headers=h, method=method)
    return urllib.request.urlopen(r, timeout=60)

def already_imported():
    # source_doc_id we have already loaded, so daily runs skip parsed statements.
    r = sb("GET", "/rest/v1/bank_transactions?select=source_doc_id&source_doc_id=like.gmail-im-*")
    return {row["source_doc_id"] for row in json.load(r) if row.get("source_doc_id")}

def list_statements():
    # Recency guard: the one-time backfill already loaded all history, and old
    # months are immutable, so a daily run only needs the last ~75 days of
    # statements (the current + previous month, where a new statement lands or a
    # period finalises). This caps daily Claude calls to ~0-4 and stops empty
    # historical statements (which leave no source_doc_id to skip on) from being
    # re-parsed every run.
    out = []; req = gm.users().messages().list(userId="me", q="from:infomail@imbank.co.ke subject:(Account Statement) newer_than:75d", maxResults=200)
    while req is not None:
        r = req.execute(); out += r.get("messages", []); req = gm.users().messages().list_next(req, r)
    return out

def get_pdfs(mid):
    m = gm.users().messages().get(userId="me", id=mid, format="full").execute()
    out = []
    def walk(p):
        if p.get("filename", "").lower().endswith(".pdf"):
            aid = p.get("body", {}).get("attachmentId")
            if aid:
                a = gm.users().messages().attachments().get(userId="me", messageId=mid, id=aid).execute()
                out.append((p["filename"], base64.urlsafe_b64decode(a["data"])))
        for c in p.get("parts", []) or []: walk(c)
    walk(m["payload"]); return out

def decrypted_b64(b):
    r = PdfReader(io.BytesIO(b))
    if r.is_encrypted: r.decrypt(PW)
    w = PdfWriter()
    for pg in r.pages: w.add_page(pg)
    buf = io.BytesIO(); w.write(buf); return base64.standard_b64encode(buf.getvalue()).decode()

PROMPT = """This is an I&M Bank (Kenya) account statement PDF. Extract EVERY transaction line exactly.
Return STRICT JSON only:
{"account_last4":"<4 digits>","period":"YYYY-MM","opening_balance":<num>,"closing_balance":<num>,
 "transactions":[{"tran_date":"YYYY-MM-DD","ref":"<Ref No or empty>","amount":<positive>,"direction":"in|out","balance":<running balance>,"narrative":"<single line>"}]}
Rules: account_last4 = last 4 digits of the masked account number. Skip the B/F line (its balance = opening_balance).
direction: a line that INCREASES running balance is "in", one that DECREASES it is "out"; amount = abs(balance - prev_balance).
Currency KES. Convert DD-MM-YY / DD-MM-YYYY to YYYY-MM-DD (20YY). Include fees/duties as "out". Never invent a line.
The chain must reconcile: opening + sum(in) - sum(out) = closing."""

def parse(pdf_b64):
    body = json.dumps({"model": MODEL, "max_tokens": 8000, "messages": [{"role": "user", "content": [
        {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
        {"type": "text", "text": PROMPT}]}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=180))
    txt = "".join(b.get("text", "") for b in r["content"])
    return json.loads(re.search(r"\{.*\}", txt, re.S).group(0))

def sig(acct, t):
    ref = (t.get("ref") or "").strip()
    if ref and ref not in ("", "-"): return f"IM{acct}-{ref}"
    raw = f"{acct}|{t['tran_date']}|{t['amount']}|{t['direction']}|{t['balance']}|{t['narrative'][:40]}"
    return "IM-" + hashlib.sha1(raw.encode()).hexdigest()[:16]

def main():
    done = already_imported()
    msgs = list_statements()
    print(f"statements in mailbox: {len(msgs)}; already imported docs: {len(done)}", file=sys.stderr)
    new_rows = []; parsed = 0; recon_fail = []
    for msg in msgs:
        for fn, b in get_pdfs(msg["id"]):
            doc_id = f"gmail-im-{fn}"
            if doc_id in done: continue
            try:
                data = parse(decrypted_b64(b))
            except Exception as e:
                print(f"  parse FAIL {fn}: {e}", file=sys.stderr); continue
            acct = data.get("account_last4", "?"); txns = data.get("transactions", [])
            op = float(data.get("opening_balance", 0)); cl = float(data.get("closing_balance", 0))
            net = sum(t["amount"] if t["direction"] == "in" else -t["amount"] for t in txns)
            ok = abs((op + net) - cl) < 1.0
            parsed += 1
            if not ok: recon_fail.append((fn, op, cl, round(op + net, 2)))
            print(f"  NEW {fn} acct…{acct} {data.get('period')} txns={len(txns)} recon={'OK' if ok else 'MISMATCH'}", file=sys.stderr)
            for t in txns:
                label = "I&M …2250 (payroll/ops)" if acct == "2250" else "I&M …2251 (secondary)" if acct == "2251" else f"I&M …{acct}"
                new_rows.append({"account": label, "txn_date": t["tran_date"], "description": t["narrative"][:300],
                    "amount": t["amount"], "currency": "KES", "direction": t["direction"], "balance": t.get("balance"),
                    "category": None, "source_doc_id": doc_id, "confidence": "reconciled" if ok else "unreconciled",
                    "signature": sig(acct, t)})
    uniq = {r["signature"]: r for r in new_rows}; rows = list(uniq.values())
    print(f"parsed {parsed} new statement(s); {len(rows)} new rows", file=sys.stderr)
    for i in range(0, len(rows), 200):
        sb("POST", "/rest/v1/bank_transactions?on_conflict=signature", rows[i:i+200],
           {"Prefer": "resolution=ignore-duplicates,return=minimal"})
    if recon_fail:
        print("RECON MISMATCHES (loaded as unreconciled, review):", file=sys.stderr)
        for fn, op, cl, calc in recon_fail: print(f"  {fn}: open {op} close {cl} calc {calc}", file=sys.stderr)
    print(f"done: loaded {len(rows)} rows from {parsed} new statement(s)")

if __name__ == "__main__":
    main()
