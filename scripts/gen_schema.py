#!/usr/bin/env python3
"""
Regenerate the consolidated schema + RLS policies from the LIVE Supabase
database (project ptvhqudonvvszupzhcfl), per HOW-WE-BUILD.md handoff Step 3.

Faithful reconstruction: column types come from format_type(), constraints from
pg_get_constraintdef(), indexes from pg_indexes.indexdef, policies from pg_policies.
The Supabase Management API token is read from the macOS Keychain at runtime, never
written to disk.

Writes:
  platform/db/schema.sql    (public schema: enums, tables, constraints, indexes)
  platform/db/policies.sql  (public schema: RLS enable + CREATE POLICY)
"""
import json, subprocess, sys, os, datetime

REF = "ptvhqudonvvszupzhcfl"
API = f"https://api.supabase.com/v1/projects/{REF}/database/query"


def token() -> str:
    return subprocess.check_output(
        ["security", "find-generic-password", "-s", "bu-supabase-token", "-w"]
    ).decode().strip()


TOKEN = token()


def q(sql: str):
    body = json.dumps({"query": sql})
    out = subprocess.check_output([
        "curl", "-s", "-X", "POST", API,
        "-H", f"Authorization: Bearer {TOKEN}",
        "-H", "Content-Type: application/json",
        "-H", "User-Agent: nisria-schema-gen",
        "-d", body,
    ]).decode()
    data = json.loads(out)
    if isinstance(data, dict) and data.get("error"):
        sys.exit(f"query error: {data}")
    return data


# ---- columns (faithful types + defaults) ----
cols = q("""
select c.relname as t, a.attname as col,
       format_type(a.atttypid, a.atttypmod) as type,
       a.attnotnull as notnull,
       pg_get_expr(d.adbin, d.adrelid) as dflt,
       a.attnum as n
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace ns on ns.oid = c.relnamespace
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where ns.nspname = 'public' and c.relkind = 'r'
  and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attnum;
""")

# ---- constraints (PK / UNIQUE / CHECK / FK) ----
cons = q("""
select conrelid::regclass::text as t, conname, contype,
       pg_get_constraintdef(oid) as def
from pg_constraint
where connamespace = 'public'::regnamespace
order by conrelid::regclass::text,
         case contype when 'p' then 0 when 'u' then 1 when 'f' then 2 else 3 end,
         conname;
""")

# ---- indexes (skip those that back a constraint of the same name) ----
idx = q("""
select tablename as t, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
""")

# ---- enums ----
enums = q("""
select tt.typname as name, e.enumlabel as label
from pg_type tt
join pg_enum e on e.enumtypid = tt.oid
join pg_namespace n on n.oid = tt.typnamespace
where n.nspname = 'public'
order by tt.typname, e.enumsortorder;
""")

# ---- policies ----
pols = q("""
select tablename as t, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
""")

# ---- rls-enabled tables ----
rls = q("""
select c.relname as t, c.relrowsecurity as on
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
""")

# strip the leading 'public.' regclass prefix for readability
def short(t):
    return t.split(".", 1)[1] if t.startswith("public.") else t

# group by table
from collections import defaultdict, OrderedDict
cols_by = defaultdict(list)
for r in cols:
    cols_by[r["t"]].append(r)
cons_by = defaultdict(list)
con_names = defaultdict(set)
for r in cons:
    t = short(r["t"])
    cons_by[t].append(r)
    con_names[t].add(r["conname"])
idx_by = defaultdict(list)
for r in idx:
    idx_by[r["t"]].append(r)
enum_by = OrderedDict()
for r in enums:
    enum_by.setdefault(r["name"], []).append(r["label"])

tables = sorted(cols_by.keys())
stamp = datetime.date.today().isoformat()

# ---------------- schema.sql ----------------
out = []
out.append(f"-- Nisria Command Center · consolidated schema (public)")
out.append(f"-- Regenerated from live Supabase project {REF} on {stamp}")
out.append(f"-- Source: HOW-WE-BUILD.md handoff Step 3. Generator: scripts/gen_schema.py")
out.append(f"-- Faithful reconstruction via format_type / pg_get_constraintdef / pg_indexes.")
out.append("")

if enum_by:
    out.append("-- ===== enums =====")
    for name, labels in enum_by.items():
        vals = ", ".join("'" + l.replace("'", "''") + "'" for l in labels)
        out.append(f"CREATE TYPE public.{name} AS ENUM ({vals});")
    out.append("")

for t in tables:
    out.append(f"-- ===== table: {t} =====")
    lines = []
    for c in cols_by[t]:
        seg = f'  "{c["col"]}" {c["type"]}'
        if c["dflt"] is not None:
            seg += f' DEFAULT {c["dflt"]}'
        if c["notnull"]:
            seg += " NOT NULL"
        lines.append(seg)
    for c in cons_by[t]:
        lines.append(f'  CONSTRAINT "{c["conname"]}" {c["def"]}')
    out.append(f"CREATE TABLE public.{t} (")
    out.append(",\n".join(lines))
    out.append(");")
    # non-constraint indexes
    for ix in idx_by.get(t, []):
        if ix["indexname"] in con_names[t]:
            continue
        out.append(ix["indexdef"] + ";")
    out.append("")

schema_sql = "\n".join(out) + "\n"

# ---------------- policies.sql ----------------
p = []
p.append(f"-- Nisria Command Center · RLS policies (public)")
p.append(f"-- Regenerated from live Supabase project {REF} on {stamp}")
p.append(f"-- Source: HOW-WE-BUILD.md handoff Step 3. Generator: scripts/gen_schema.py")
p.append("")
p.append("-- ===== enable row level security =====")
for r in rls:
    if r["on"]:
        p.append(f"ALTER TABLE public.{r['t']} ENABLE ROW LEVEL SECURITY;")
p.append("")
p.append("-- ===== policies =====")
cur = None
for r in pols:
    if r["t"] != cur:
        cur = r["t"]
        p.append(f"\n-- policies on {cur}")
    roles = r["roles"]
    if isinstance(roles, list):
        roles = ", ".join(roles)
    else:
        roles = str(roles).strip("{}").replace(",", ", ")
    cmd = r["cmd"] or "ALL"
    perm = "PERMISSIVE" if (r["permissive"] in (True, "PERMISSIVE", "t")) else "RESTRICTIVE"
    stmt = f'CREATE POLICY "{r["policyname"]}" ON public.{r["t"]}\n  AS {perm} FOR {cmd}\n  TO {roles}'
    if r["qual"] is not None:
        stmt += f"\n  USING ({r['qual']})"
    if r["with_check"] is not None:
        stmt += f"\n  WITH CHECK ({r['with_check']})"
    p.append(stmt + ";")
policies_sql = "\n".join(p) + "\n"

os.makedirs("platform/db", exist_ok=True)
with open("platform/db/schema.sql", "w") as f:
    f.write(schema_sql)
with open("platform/db/policies.sql", "w") as f:
    f.write(policies_sql)

print(f"tables: {len(tables)}")
print(f"enums: {len(enum_by)}")
print(f"constraints: {len(cons)}")
print(f"indexes: {len(idx)}")
print(f"policies: {len(pols)}")
print(f"rls-enabled: {sum(1 for r in rls if r['on'])}")
print("wrote platform/db/schema.sql and platform/db/policies.sql")
