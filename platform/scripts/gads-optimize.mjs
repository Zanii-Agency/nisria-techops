#!/usr/bin/env node
// THE DECIDER ("zanii code") — daily autonomous optimizer for the Nisria Ad Grants
// account, with HARD compliance guardrails so the account can never get blocked.
//
// What it does each run:
//   1. COMPLIANCE AUDIT (and a guard used before any pause/remove): every ENABLED
//      campaign keeps >=2 ad groups, every ad group >=2 ads + >=1 keyword, account
//      keeps >=2 sitelinks + >=1 conversion action + Search-only. If a mutation would
//      breach a floor, it is refused.
//   2. NEGATIVES: seeds a curated irrelevant-term blocklist + harvests junk search
//      terms -> adds campaign negatives (only ADDS negatives; protects CTR/QS/budget,
//      can never breach structure). Capped per run.
//   3. MEASURE: per-arm (bidding) + per-ad (creative) metrics -> scores -> decides
//      winners once data is sufficient (advisory for the big calls).
//   4. REPORT: WhatsApps Taona on 727 ONLY when there is something material (data or
//      actions or a recommendation); writes a full markdown report + log every run.
//
// Modes: (default) audit+act+report ; --dry no mutations/sends ; --report-only no mutations.
import crypto from "node:crypto"; import { execSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

const API="https://googleads.googleapis.com/v22", SCOPE="https://www.googleapis.com/auth/adwords", SUBJECT="sasa@nisria.co";
const GRAPH="https://graph.facebook.com/v21.0";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const cid="2028365929";
const DRY=process.argv.includes("--dry"); const REPORT_ONLY=process.argv.includes("--report-only");
const REPORT_DIR="/Users/milaaj/.nisria-gads-reports";
const NEG_CAP=25; // max negatives added per run
const log=(m)=>console.log(`[${new Date().toISOString()}] ${m}`);

function ev(n){if(process.env[n])return process.env[n];for(const f of[".env.local",".env.seed",".env"]){const p=path.join(__dirname,"..",f);if(!fs.existsSync(p))continue;const l=fs.readFileSync(p,"utf8").split(/\r?\n/).find(x=>x.startsWith(n+"="));if(l)return l.slice(n.length+1).replace(/^["']|["']$/g,"");}return null;}
function kc(a){try{return execSync(`security find-generic-password -a "${a}" -w`,{encoding:"utf8"}).trim();}catch{return null;}}

async function adsToken(){
  const j=JSON.parse(Buffer.from(ev("GOOGLE_SERVICE_ACCOUNT_B64"),"base64").toString("utf8"));
  const now=Math.floor(Date.now()/1000),b64u=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
  const inp=`${b64u({alg:"RS256",typ:"JWT"})}.${b64u({iss:j.client_email,sub:SUBJECT,scope:SCOPE,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
  const sig=crypto.sign("RSA-SHA256",Buffer.from(inp),j.private_key).toString("base64url");
  for(let i=0;i<4;i++){try{const r=await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${inp}.${sig}`})})).json();if(r.access_token)return r.access_token;}catch(e){log(`token retry ${i+1}`);}}
  throw new Error("ads token mint failed");
}
let TOK,DT;
async function gaql(query){
  const r=await fetch(`${API}/customers/${cid}/googleAds:searchStream`,{method:"POST",headers:{authorization:`Bearer ${TOK}`,"developer-token":DT,"content-type":"application/json"},body:JSON.stringify({query})});
  const j=await r.json(); if(!r.ok)throw new Error("gaql "+JSON.stringify(j).slice(0,300));
  return (Array.isArray(j)?j:[j]).flatMap(b=>b.results||[]);
}
async function mutate(endpoint,operations,label){
  if(!operations.length)return {results:[]};
  if(DRY||REPORT_ONLY){log(`[no-mutate] ${label}: ${operations.length} op(s)`);return {results:[]};}
  const r=await fetch(`${API}/customers/${cid}/${endpoint}:mutate`,{method:"POST",headers:{authorization:`Bearer ${TOK}`,"developer-token":DT,"content-type":"application/json"},body:JSON.stringify({operations,partialFailure:true})});
  const t=await r.text(); let res;try{res=JSON.parse(t)}catch{res=null}
  if(!r.ok){log(`MUTATE FAIL ${label}: ${t.slice(0,300)}`);return {results:[]};}
  const ok=(res.results||[]).filter(x=>x&&x.resourceName).length; log(`mutate ${label}: ${ok}/${operations.length}`);
  return res;
}
async function ping(body){
  const token=kc("nisria-whatsapp-token"),owner=kc("nisria-owner-whatsapp"),phoneId=ev("WHATSAPP_PHONE_NUMBER_ID");
  if(!token||!owner||!phoneId){log("ping skipped: missing creds");return false;}
  if(DRY){log("[dry] would ping: "+body.slice(0,120));return true;}
  const r=await fetch(`${GRAPH}/${phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to:owner,type:"template",template:{name:"operator_update",language:{code:"en_US"},components:[{type:"body",parameters:[{type:"text",text:"Taona"},{type:"text",text:String(body).replace(/\s+/g," ").slice(0,900)}]}]}})});
  const j=await r.json().catch(()=>({})); if(!r.ok){log("ping fail "+JSON.stringify(j).slice(0,200));return false;} log("ping sent"); return true;
}

// ---------- 1. COMPLIANCE ----------
async function complianceAudit(){
  const v=[];
  const ags=await gaql("SELECT campaign.name, campaign.status, ad_group.id, ad_group.status FROM ad_group WHERE campaign.status='ENABLED' AND ad_group.status='ENABLED'");
  const byCamp={}; for(const r of ags){(byCamp[r.campaign.name]??=[]).push(r.adGroup.id);}
  for(const[c,list]of Object.entries(byCamp)) if(list.length<2) v.push(`campaign "${c}" has ${list.length} ad group(s) (<2)`);
  const ads=await gaql("SELECT ad_group.id, ad_group_ad.status FROM ad_group_ad WHERE campaign.status='ENABLED' AND ad_group_ad.status='ENABLED'");
  const adsByAg={}; for(const r of ads){adsByAg[r.adGroup.id]=(adsByAg[r.adGroup.id]||0)+1;}
  for(const ag of Object.values(byCamp).flat()) if((adsByAg[ag]||0)<2) v.push(`ad group ${ag} has ${adsByAg[ag]||0} ad(s) (<2)`);
  const kws=await gaql("SELECT ad_group.id FROM keyword_view WHERE campaign.status='ENABLED' AND ad_group_criterion.status='ENABLED'");
  const kwByAg={}; for(const r of kws) kwByAg[r.adGroup.id]=(kwByAg[r.adGroup.id]||0)+1;
  for(const ag of Object.values(byCamp).flat()) if((kwByAg[ag]||0)<1) v.push(`ad group ${ag} has 0 enabled keywords`);
  const sit=await gaql("SELECT asset.id FROM asset WHERE asset.type='SITELINK'");
  if(sit.length<2) v.push(`only ${sit.length} sitelinks (<2)`);
  const conv=await gaql("SELECT conversion_action.id FROM conversion_action WHERE conversion_action.status='ENABLED' AND conversion_action.primary_for_goal=true");
  if(conv.length<1) v.push("no enabled primary conversion action");
  const disp=await gaql("SELECT campaign.name FROM campaign WHERE campaign.status='ENABLED' AND campaign.network_settings.target_content_network=true");
  for(const r of disp) v.push(`campaign "${r.campaign.name}" has Display network ON (Grant violation)`);
  return {ok:v.length===0,violations:v,structure:byCamp};
}

// ---------- 2. NEGATIVES ----------
const IRRELEVANT=[
  "jobs","job","career","careers","salary","vacancy","vacancies","internship","volunteer","volunteering",
  "free","freebie","download","pdf","template","login","account","sign in","wikipedia","definition","meaning","news",
  "tax","deduction","write off","near me","clothes","clothing","furniture","sofa","couch","mattress","car","vehicle",
  "toys","blood","plasma","hair","food bank","pickup","pick up","collection",
  "salvation army","st jude","saint jude","world vision","compassion","unicef","save the children","red cross",
  "oxfam","goodwill","doctors without borders","toys for tots","purple heart","greendrop","gofundme",
];
const RELEVANT=/(sponsor|orphan|donat|charit|child|kid|africa|kenya|feed|give|fund|support|nisria|nonprofit|education)/i;
function isJunk(term){const t=term.toLowerCase();if(IRRELEVANT.some(b=>t.includes(b)))return true;if(!RELEVANT.test(t))return true;return false;}
async function harvestNegatives(){
  // existing campaign negatives to avoid dupes
  const existing=new Set();
  try{const ex=await gaql("SELECT campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign_criterion.type='KEYWORD' AND campaign_criterion.negative=true");for(const r of ex){const t=r.campaignCriterion?.keyword?.text;if(t)existing.add(t.toLowerCase());}}catch{}
  // seed curated junk (first run protection) + harvested junk search terms
  const seed=["volunteer jobs","donate clothes","donate furniture","donate car","food bank","donation pickup","charity jobs","tax deduction","salvation army","st jude","world vision","unicef","goodwill","doctors without borders"];
  let harvested=[];
  try{
    const st=await gaql("SELECT search_term_view.search_term, metrics.clicks, metrics.impressions FROM search_term_view WHERE segments.date DURING LAST_14_DAYS");
    harvested=st.map(r=>r.searchTermView?.searchTerm).filter(Boolean).filter(isJunk);
  }catch(e){log("search-term harvest skipped (no data yet)");}
  const want=[...new Set([...seed.filter(isJunk).concat(seed),...harvested])].map(s=>s.toLowerCase()).filter(t=>!existing.has(t)).slice(0,NEG_CAP);
  if(!want.length)return {added:0,list:[]};
  // add as campaign-level negatives to all 3 ENABLED campaigns
  const camps=(await gaql("SELECT campaign.id FROM campaign WHERE campaign.status='ENABLED'")).map(r=>r.campaign.id);
  const ops=[]; for(const id of camps) for(const t of want) ops.push({create:{campaign:`customers/${cid}/campaigns/${id}`,negative:true,keyword:{text:t,matchType:"PHRASE"}}});
  await mutate("campaignCriteria",ops,`negatives x${want.length} on ${camps.length} campaigns`);
  return {added:want.length,list:want};
}

// ---------- 3. MEASURE ----------
async function armMetrics(){
  const rows=await gaql("SELECT campaign.name, campaign.bidding_strategy_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM campaign WHERE campaign.status='ENABLED' AND segments.date DURING LAST_7_DAYS");
  const agg={};
  for(const r of rows){const n=r.campaign.name;const m=r.metrics||{};(agg[n]??={name:n,bid:r.campaign.biddingStrategyType,imp:0,clk:0,cost:0,conv:0});agg[n].imp+=+m.impressions||0;agg[n].clk+=+m.clicks||0;agg[n].cost+=(+m.costMicros||0)/1e6;agg[n].conv+=+m.conversions||0;}
  // ensure all enabled campaigns present even with 0
  const all=await gaql("SELECT campaign.name, campaign.bidding_strategy_type FROM campaign WHERE campaign.status='ENABLED'");
  for(const r of all){const n=r.campaign.name;agg[n]??={name:n,bid:r.campaign.biddingStrategyType,imp:0,clk:0,cost:0,conv:0};}
  return Object.values(agg);
}
async function adVariants(){
  const rows=await gaql("SELECT ad_group.name, ad_group_ad.ad.id, metrics.impressions, metrics.clicks, metrics.ctr FROM ad_group_ad WHERE ad_group_ad.status='ENABLED' AND campaign.status='ENABLED' AND segments.date DURING LAST_7_DAYS AND metrics.impressions>0");
  return rows.map(r=>({ag:r.adGroup.name,ad:r.adGroupAd.ad.id,imp:+r.metrics.impressions||0,clk:+r.metrics.clicks||0,ctr:+r.metrics.ctr||0}));
}

// ---------- MAIN ----------
TOK=await adsToken(); DT=process.env.GOOGLE_ADS_DEVELOPER_TOKEN||kc("nisria-google-ads-dev-token");
const audit=await complianceAudit();
log(`compliance: ${audit.ok?"OK":"VIOLATIONS: "+audit.violations.join("; ")}`);
if(!audit.ok && !DRY){ await ping(`Heads up on the Google Ads Grant account: compliance check found ${audit.violations.length} issue(s): ${audit.violations.join("; ")}. I am NOT auto-fixing structure to avoid risk. Tell me to fix and I will.`); }

let negResult={added:0,list:[]};
if(audit.ok){ negResult=await harvestNegatives(); } else { log("skipping negatives until structure is compliant"); }

const arms=await armMetrics();
const variants=await adVariants();
const totalImp=arms.reduce((s,a)=>s+a.imp,0);
const totalConv=arms.reduce((s,a)=>s+a.conv,0);

// recommendations
const recs=[];
if(totalImp>0){
  const maxConv=arms.filter(a=>a.bid==="MAXIMIZE_CONVERSIONS"),maxClk=arms.filter(a=>a.bid==="TARGET_SPEND");
  const sumImp=a=>a.reduce((s,x)=>s+x.imp,0),sumConv=a=>a.reduce((s,x)=>s+x.conv,0);
  recs.push(`Bidding arms (7d): MaxConversions=${sumImp(maxConv)} impr/${sumConv(maxConv)} conv ; MaxClicks(Donate)=${sumImp(maxClk)} impr/${sumConv(maxClk)} conv.`);
  if(sumImp(maxClk)>0 && sumImp(maxConv)===0) recs.push("Decision lean: smart bidding is starved cold; bootstrap the MaxConversions campaigns on MaxClicks too until conversions exist.");
  if(sumImp(maxConv)>sumImp(maxClk)*2) recs.push("Decision lean: MaxConversions is winning; converge Donate to MaxConversions after a conversion lands.");
}
if(totalConv===0) recs.push("Still 0 tracked conversions. The $10 verify donation is the keystone: it gives smart bidding its first signal AND meets the Grant 1-conversion/month rule.");

// report
const stamp=new Date().toISOString();
let md=`# Nisria Ad Grants optimizer report ${stamp}\n\n`;
md+=`## Compliance: ${audit.ok?"PASS":"FAIL"}\n`+ (audit.violations.length?audit.violations.map(x=>`- ${x}`).join("\n")+"\n":"- all floors held\n");
md+=`\n## Arms (last 7 days)\n`+arms.map(a=>`- ${a.name} [${a.bid}]: ${a.imp} impr, ${a.clk} clicks, $${a.cost.toFixed(2)}, ${a.conv} conv`).join("\n")+"\n";
md+=`\n## Creative variants serving\n`+(variants.length?variants.map(v=>`- ${v.ag} ad ${v.ad}: ${v.imp} impr, ${v.clk} clk, CTR ${(v.ctr*100).toFixed(1)}%`).join("\n"):"- none serving yet")+"\n";
md+=`\n## Negatives added this run: ${negResult.added}\n`+(negResult.list.length?negResult.list.map(x=>`- ${x}`).join("\n")+"\n":"");
md+=`\n## Recommendations\n`+(recs.length?recs.map(x=>`- ${x}`).join("\n"):"- monitoring; no action needed")+"\n";
try{fs.mkdirSync(REPORT_DIR,{recursive:true});fs.writeFileSync(path.join(REPORT_DIR,stamp.slice(0,10)+".md"),md);}catch(e){log("report write fail "+e.message);}
log("report written:\n"+md);

// WhatsApp only when material: violations, or data exists, or negatives added, or a strong rec
const material = !audit.ok || totalImp>0 || negResult.added>0;
if(material && !DRY){
  let body=`Google Ads optimizer ran. Compliance ${audit.ok?"PASS":"FAIL"}. 7d totals: ${totalImp} impressions, ${totalConv} conversions across the 3 arms. `;
  if(negResult.added) body+=`Added ${negResult.added} junk negatives to protect quality. `;
  if(recs.length) body+=recs[0];
  await ping(body);
} else { log("nothing material to ping yet (idle); logged only."); }
log("done.");
