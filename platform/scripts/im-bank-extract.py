#!/usr/bin/env python3
# I&M extraction -> bank_transactions. Headless Gmail (SA/DWD), decrypt, parse
# each MONTHLY statement with Claude (vision, reconciliation-gated), dedup on the
# bank's own ref (signature), upsert to bank_transactions. Money-truth: a
# statement whose chain does not reconcile to its stated closing is REPORTED and
# its rows are tagged unreconciled, never silently trusted.
import base64, io, json, sys, re, hashlib, subprocess, urllib.request
from google.oauth2 import service_account
from googleapiclient.discovery import build
from pypdf import PdfReader, PdfWriter

KEY = "/Users/milaaj/Downloads/crack-cogency-497521-r0-1908b8fb29ae.json"
SUBJECT = "sasa@nisria.co"; PW = __import__("os").environ.get("IM_PDF_PW","")  # six digits after first four of the account no; pass via IM_PDF_PW
SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
ANTHROPIC = subprocess.check_output(["security","find-generic-password","-s","rinq-anthropic-key","-w"]).decode().strip()
MODEL = "claude-opus-4-8"

# Supabase
def seed(k):
    txt = open("/Users/milaaj/Code/nisria-techops/platform/.env.seed").read()
    m = re.search(rf"^{k}=(.*)$", txt, re.M); return m.group(1).strip().strip('"') if m else ""
SB_URL = seed("SUPABASE_URL").rstrip("/"); SB_KEY = seed("SUPABASE_SERVICE_KEY")

creds = service_account.Credentials.from_service_account_file(KEY, scopes=SCOPES, subject=SUBJECT)
gm = build("gmail","v1",credentials=creds,cache_discovery=False)

def list_msgs():
    out=[]; req=gm.users().messages().list(userId="me",q="from:infomail@imbank.co.ke subject:(Account Statement)",maxResults=200)
    while req is not None:
        r=req.execute(); out+=r.get("messages",[]); req=gm.users().messages().list_next(req,r)
    return out

def get_pdfs(mid):
    m=gm.users().messages().get(userId="me",id=mid,format="full").execute()
    subj="";
    for h in m["payload"].get("headers",[]):
        if h["name"].lower()=="subject": subj=h["value"]
    out=[]
    def walk(p):
        if p.get("filename","").lower().endswith(".pdf"):
            aid=p.get("body",{}).get("attachmentId")
            if aid:
                a=gm.users().messages().attachments().get(userId="me",messageId=mid,id=aid).execute()
                out.append((p["filename"], base64.urlsafe_b64decode(a["data"])))
        for c in p.get("parts",[]) or []: walk(c)
    walk(m["payload"]); return subj,out

def decrypted_pdf_b64(b):
    r=PdfReader(io.BytesIO(b))
    if r.is_encrypted: r.decrypt(PW)
    w=PdfWriter()
    for pg in r.pages: w.add_page(pg)
    buf=io.BytesIO(); w.write(buf); return base64.standard_b64encode(buf.getvalue()).decode()

PROMPT = """This is an I&M Bank (Kenya) account statement PDF. Extract EVERY transaction line exactly.

Return STRICT JSON only (no prose):
{"account_last4":"2250|2251","period":"YYYY-MM","opening_balance":<num>,"closing_balance":<num>,
 "transactions":[{"tran_date":"YYYY-MM-DD","ref":"<Ref No or empty>","amount":<positive num>,"direction":"in|out","balance":<running balance after this line>,"narrative":"<full narrative, single line>"}]}

Rules:
- account_last4 = last 4 digits of the masked account number on the statement.
- Skip the B/F opening line itself (use its balance as opening_balance).
- direction: a line that INCREASES the running balance is "in"; one that DECREASES it is "out". amount is always positive = abs(balance - previous_balance).
- Currency is KES. Dates: convert DD-MM-YY / DD-MM-YYYY to YYYY-MM-DD (20YY).
- Include fees/charges/duties as their own "out" transactions.
- Be exact with numbers. Never invent a line. The chain must reconcile: opening + sum(in) - sum(out) = closing."""

def parse_statement(pdf_b64):
    body=json.dumps({"model":MODEL,"max_tokens":8000,"messages":[{"role":"user","content":[
        {"type":"document","source":{"type":"base64","media_type":"application/pdf","data":pdf_b64}},
        {"type":"text","text":PROMPT}]}]}).encode()
    req=urllib.request.Request("https://api.anthropic.com/v1/messages",data=body,
        headers={"x-api-key":ANTHROPIC,"anthropic-version":"2023-06-01","content-type":"application/json"})
    r=json.load(urllib.request.urlopen(req,timeout=180))
    txt="".join(b.get("text","") for b in r["content"])
    m=re.search(r"\{.*\}",txt,re.S); return json.loads(m.group(0))

def sig(acct,t):
    base = t.get("ref","").strip()
    if base and base not in ("","-"): return f"IM{acct}-{base}"
    raw=f"{acct}|{t['tran_date']}|{t['amount']}|{t['direction']}|{t['balance']}|{t['narrative'][:40]}"
    return "IM-"+hashlib.sha1(raw.encode()).hexdigest()[:16]

msgs=list_msgs(); print(f"statements: {len(msgs)}",file=sys.stderr)
all_rows=[]; recon=[]
seen_doc=set()
for i,msg in enumerate(msgs):
    subj,pdfs=get_pdfs(msg["id"])
    for fn,b in pdfs:
        if fn in seen_doc: continue
        seen_doc.add(fn)
        try:
            data=parse_statement(decrypted_pdf_b64(b))
        except Exception as e:
            print(f"  parse FAIL {fn}: {e}",file=sys.stderr); continue
        acct=data.get("account_last4","?"); txns=data.get("transactions",[])
        op=float(data.get("opening_balance",0)); cl=float(data.get("closing_balance",0))
        net=sum(t["amount"] if t["direction"]=="in" else -t["amount"] for t in txns)
        ok=abs((op+net)-cl)<1.0
        recon.append((fn,data.get("period"),acct,len(txns),op,cl,round(op+net,2),ok))
        print(f"  {fn} acct…{acct} {data.get('period')} txns={len(txns)} recon={'OK' if ok else 'MISMATCH'}",file=sys.stderr)
        for t in txns:
            label = "I&M …2250 (payroll/ops)" if acct=="2250" else "I&M …2251 (secondary)" if acct=="2251" else f"I&M …{acct}"
            all_rows.append({"account":label,"txn_date":t["tran_date"],"description":t["narrative"][:300],
                "amount":t["amount"],"currency":"KES","direction":t["direction"],"balance":t.get("balance"),
                "category":None,"source_doc_id":f"gmail-im-{fn}","confidence":"reconciled" if ok else "unreconciled",
                "signature":sig(acct,t)})

# dedup on signature
uniq={r["signature"]:r for r in all_rows}; rows=list(uniq.values())
print(f"\nTOTAL parsed rows: {len(all_rows)}, unique: {len(rows)}",file=sys.stderr)
print("--- reconciliation ---",file=sys.stderr)
for fn,per,acct,n,op,cl,calc,ok in sorted(recon,key=lambda x:(x[2],x[1] or "")):
    print(f"  …{acct} {per}: {n} txns, open {op:,.2f} close {cl:,.2f} calc {calc:,.2f} {'OK' if ok else 'XX MISMATCH'}",file=sys.stderr)

json.dump(rows, open(sys.argv[1] if len(sys.argv)>1 else "im_rows.json","w"))
print(f"\nwrote {len(rows)} rows to {sys.argv[1] if len(sys.argv)>1 else 'im_rows.json'}",file=sys.stderr)
