#!/usr/bin/env python3
# Load im_rows.json -> bank_transactions (Supabase REST). Idempotent: signature
# is UNIQUE, so we upsert with ignore-duplicates on conflict. Reports before/after
# counts and per-account / per-month KES out totals so the import is verifiable.
import json, re, sys, urllib.request

def seed(k):
    txt=open("/Users/milaaj/Code/nisria-techops/platform/.env.seed").read()
    m=re.search(rf"^{k}=(.*)$",txt,re.M); return m.group(1).strip().strip('"') if m else ""
URL=seed("SUPABASE_URL").rstrip("/"); KEY=seed("SUPABASE_SERVICE_KEY")
H={"apikey":KEY,"Authorization":f"Bearer {KEY}","Content-Type":"application/json"}

def req(method,path,body=None,extra=None):
    h=dict(H);
    if extra: h.update(extra)
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(URL+path,data=data,headers=h,method=method)
    return urllib.request.urlopen(r,timeout=60)

rows=json.load(open(sys.argv[1] if len(sys.argv)>1 else "im_rows.json"))
print(f"rows to load: {len(rows)}")

# before count (I&M only)
def count(q):
    r=req("GET",f"/rest/v1/bank_transactions?{q}",extra={"Prefer":"count=exact","Range":"0-0"})
    return int(r.headers.get("Content-Range","0-0/0").split("/")[-1])
before=count("account=like.*I%26M*")
print(f"I&M rows in bank_transactions BEFORE: {before}")

# upsert in batches, ignore-duplicates on signature
ins=0
for i in range(0,len(rows),200):
    batch=rows[i:i+200]
    try:
        req("POST","/rest/v1/bank_transactions?on_conflict=signature",batch,
            {"Prefer":"resolution=ignore-duplicates,return=minimal"})
        ins+=len(batch)
    except urllib.error.HTTPError as e:
        print("batch error:",e.read().decode()[:300]);
after=count("account=like.*I%26M*")
print(f"I&M rows AFTER: {after}  (added {after-before})")

# verify: per-account, per-month KES out
import collections
agg=collections.defaultdict(lambda:[0,0.0])
for r in rows:
    if r["direction"]=="out":
        k=(r["account"], r["txn_date"][:7]); agg[k][0]+=1; agg[k][1]+=r["amount"]
print("\n--- I&M monthly OUT (KES) by account ---")
for (acct,mo),(n,s) in sorted(agg.items()):
    print(f"  {acct}  {mo}: {n} payments, KES {s:,.0f}")
