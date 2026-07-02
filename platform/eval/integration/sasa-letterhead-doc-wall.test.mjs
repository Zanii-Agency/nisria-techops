// Letterhead-doc wall (2026-07-02). "Put this on our letterhead" had no route from
// WhatsApp -> Studio doc-gen, so Sasa hedged and the send loop-break fired a
// nonsense "who do I send it to?". This wall pins the new create_letterhead_doc
// tool: registered, admin-only (cross-cutting but NOT team-safe), reuses the Studio
// path (brandWrap -> htmlToPdf -> save -> send back to the requester), and is
// HONEST on a failed send (never a false "sent"). Plus a functional brandWrap check.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };
const ok = (m) => console.log("PASS:", m);
const ST = readFileSync(resolve(HERE, "../../lib/smart-tools.ts"), "utf8");
const MAN = readFileSync(resolve(HERE, "../../lib/agents/manifests/index.ts"), "utf8");

// scope to the tool impl
const idx = ST.indexOf('if (name === "create_letterhead_doc")');
const impl = idx >= 0 ? ST.slice(idx, idx + 8500) : "";

// ---- H1: tool is registered (SMART_TOOLS def) ----
{
  if (!/\{ name: "create_letterhead_doc", description:/.test(ST)) fail("H1 create_letterhead_doc must be a registered SMART_TOOLS tool");
  else ok("H1 create_letterhead_doc is registered");
}

// ---- H2: admin-only — cross-cutting but NOT team-safe ----
{
  const inCross = /CROSS_CUTTING_TOOLS = new Set\(\[[\s\S]*?"create_letterhead_doc"[\s\S]*?\]\)/.test(MAN);
  const teamSafeBlock = MAN.slice(MAN.indexOf("TEAM_SAFE_TOOLS = new Set"), MAN.indexOf("TEAM_SAFE_TOOLS = new Set") + 1200);
  const inTeam = /"create_letterhead_doc"/.test(teamSafeBlock);
  if (!inCross) fail("H2a must be in CROSS_CUTTING_TOOLS (available whichever domain the router picks)");
  else ok("H2a cross-cutting (router-proof availability)");
  if (inTeam) fail("H2b must NOT be team-safe — letterhead docs are admin/owner only");
  else ok("H2b admin/owner-only (not in TEAM_SAFE_TOOLS)");
}

// ---- H3: reuses the Studio path (brandWrap -> htmlToPdf -> save) ----
{
  if (!/brandWrap\(\{ brandKey/.test(impl)) fail("H3a must wrap in the branded letterhead (brandWrap)");
  else ok("H3a uses brandWrap (letterhead + logo)");
  if (!/htmlToPdf\(html\)/.test(impl)) fail("H3b must render a real PDF (htmlToPdf) with HTML fallback");
  else ok("H3b renders PDF (htmlToPdf), HTML fallback");
  if (!/from\("studio_documents"\)\.insert/.test(impl)) fail("H3c must persist to studio_documents (findable later)");
  else ok("H3c persists to studio_documents");
}

// ---- H4: delivers the file BACK to the requester, honestly ----
{
  if (!/sendDocument\(to, fileUrl/.test(impl)) fail("H4a must send the file via sendDocument to the requester");
  else ok("H4a sends the branded file back via sendDocument");
  // recipient resolution: senderPhone -> contact -> operator
  if (!/ctx\.senderPhone/.test(impl) || !/ownerKeys\(\)/.test(impl)) fail("H4b must resolve the requester (senderPhone, then contact, then operator)");
  else ok("H4b resolves the requester robustly");
  // honesty: a failed send returns delivered:false, never a false 'sent'
  if (!/delivered: false/.test(impl) || !/couldn't send the file here/.test(impl)) fail("H4c a failed delivery must be honest (delivered:false), never a false 'sent'");
  else ok("H4c honest on a failed send (no false 'sent')");
}

// ---- H5: functional — brandWrap actually stamps the letterhead onto the body ----
{
  const bd = await import("../../lib/brand-doc.ts");
  const html = bd.brandWrap({ brandKey: "nisria", title: "Nakuru filming request", bodyHtml: "<p>Dear Director, We at Nisria would like to film...</p>", dateStr: "July 2, 2026", logoUri: null });
  if (typeof html !== "string" || html.length < 200) fail("H5a brandWrap must return a full HTML document");
  else ok("H5a brandWrap returns a document");
  if (!/We at Nisria would like to film/.test(html)) fail("H5b the operator's body text must survive into the letterhead doc");
  else ok("H5b body text is preserved on the letterhead");
  if (!/July 2, 2026/.test(html)) fail("H5c the resolved date must stamp on the letterhead");
  else ok("H5c date stamped");
}

// ---- H6: exposed on the Claude MCP bridge WITHOUT an autonomous send (ADR-0015) ----
{
  const MCP = readFileSync(resolve(HERE, "../../lib/mcp-tools.ts"), "utf8");
  if (!/registerTool\(\s*"create_letterhead_doc"/.test(MCP)) fail("H6a bridge must expose create_letterhead_doc (so Nur can 'do it via Claude')");
  else ok("H6a create_letterhead_doc is on the MCP bridge");
  if (!/viaBridge: true/.test(MCP)) fail("H6b bridge must call it viaBridge:true");
  else ok("H6b bridge invokes it viaBridge:true");
  // viaBridge delivers the PDF to Nur's OWN WhatsApp (the point of the MCP), to a
  // FIXED owner recipient (NUR_WA_ID) — never a model-chosen third party — with a
  // link fallback when her 24h window is closed.
  if (!/\(ctx as any\)\.viaBridge/.test(impl) || !/NUR_WA_ID/.test(impl) || !/sendDocument\(nur,/.test(impl)) fail("H6c viaBridge must deliver the PDF to Nur's own WhatsApp (fixed owner recipient)");
  else ok("H6c viaBridge delivers the PDF to Nur's WhatsApp (fixed owner, link fallback)");
}

// ---- H7: GENERAL document capability (contracts/reports), rich rendering ----
{
  // tool covers more than letters + has a doc_type param
  const def = ST.slice(ST.indexOf('name: "create_letterhead_doc"'), ST.indexOf('name: "create_letterhead_doc"') + 1600);
  if (!/contract/i.test(def) || !/doc_type/.test(def)) fail("H7a tool must be general (contract/report/... + doc_type param), not letter-only");
  else ok("H7a general doc capability (contracts, reports, ... via doc_type)");
  if (!/docBodyToHtml\(bodyText\)/.test(impl)) fail("H7b must render the body via docBodyToHtml (structure-preserving), not flat-escape");
  else ok("H7b renders body richly via docBodyToHtml");
  // functional: markdown -> HTML, and HTML passthrough strips <script>
  const { docBodyToHtml } = await import("../../lib/doc-format.mjs");
  const md = docBodyToHtml("# Consultancy Agreement\n\nThis **agreement** is between:\n\n- Party A\n- Party B");
  if (!/<h1>Consultancy Agreement<\/h1>/.test(md) || !/<strong>agreement<\/strong>/.test(md) || !/<li>Party A<\/li>/.test(md)) fail("H7c markdown must render headings/bold/lists");
  else ok("H7c markdown renders headings + bold + lists");
  const htmlIn = docBodyToHtml('<h2>Clause 1</h2><p>Term.</p><script>alert(1)</script>');
  if (/<script/i.test(htmlIn)) fail("H7d model HTML passthrough must strip <script>");
  else if (!/<h2>Clause 1<\/h2>/.test(htmlIn)) fail("H7d HTML structure must survive");
  else ok("H7d semantic HTML passes through, script stripped");
}

if (process.exitCode) console.error("\nsasa-letterhead-doc-wall: FAIL");
else console.log("\nsasa-letterhead-doc-wall: ALL GREEN");
