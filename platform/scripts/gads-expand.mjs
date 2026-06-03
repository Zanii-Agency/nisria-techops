#!/usr/bin/env node
// EXPAND + COMPLIANCE: (1) add a 2nd ad group + 2 RSAs to Brand campaign (Ad Grants
// requires >=2 ad groups per campaign). (2) add mission-relevant expansion keywords.
import crypto from "node:crypto"; import { execSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const API="https://googleads.googleapis.com/v22", SCOPE="https://www.googleapis.com/auth/adwords", SUBJECT="sasa@nisria.co";
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const cid=process.argv[2]||"2028365929"; const DRY=process.argv.includes("--dry");
function ev(n){if(process.env[n])return process.env[n];for(const f of[".env.local",".env.seed",".env"]){const p=path.join(__dirname,"..",f);if(!fs.existsSync(p))continue;const l=fs.readFileSync(p,"utf8").split(/\r?\n/).find(x=>x.startsWith(n+"="));if(l)return l.slice(n.length+1).replace(/^["']|["']$/g,"");}return null;}
const dt=process.env.GOOGLE_ADS_DEVELOPER_TOKEN||execSync('security find-generic-password -a "nisria-google-ads-dev-token" -w',{encoding:"utf8"}).trim();
const j=JSON.parse(Buffer.from(ev("GOOGLE_SERVICE_ACCOUNT_B64"),"base64").toString("utf8"));
const now=Math.floor(Date.now()/1000),b64u=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const inp=`${b64u({alg:"RS256",typ:"JWT"})}.${b64u({iss:j.client_email,sub:SUBJECT,scope:SCOPE,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
const sig=crypto.sign("RSA-SHA256",Buffer.from(inp),j.private_key).toString("base64url");
const tok=(await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${inp}.${sig}`})})).json()).access_token;
const H={authorization:`Bearer ${tok}`,"developer-token":dt,"content-type":"application/json"};
async function mutate(endpoint,operations,label){
  if(DRY){console.log(`  [dry] ${label}: ${operations.length} op(s)`);return {results:[]};}
  const r=await fetch(`${API}/customers/${cid}/${endpoint}:mutate`,{method:"POST",headers:H,body:JSON.stringify({operations,partialFailure:true})});
  const text=await r.text(); let res;try{res=JSON.parse(text)}catch{res=null}
  if(!r.ok){console.error(`  ❌ ${label}: HTTP ${r.status}\n${text.slice(0,900)}`);return {results:[]};}
  const ok=(res.results||[]).filter(x=>x&&x.resourceName).length;
  const pf=res.partialFailureError;
  console.log(`  ✅ ${label}: ${ok}/${operations.length}${pf?` (skipped: ${(pf.message||"").slice(0,140)})`:""}`);
  return res;
}
const BRAND_CAMPAIGN=`customers/${cid}/campaigns/23904343810`;

// ---- 1. Brand 2nd ad group (compliance) ----
console.log("STEP 1 — Brand campaign 2nd ad group (Grants needs >=2 per campaign):");
const agRes=await mutate("adGroups",[{create:{campaign:BRAND_CAMPAIGN,name:"Nisria Foundation",status:"ENABLED",type:"SEARCH_STANDARD"}}],"ad group 'Nisria Foundation'");
let newAg=agRes.results?.[0]?.resourceName;
if(!newAg && !DRY){ // already exists? look it up
  const q="SELECT ad_group.resource_name, ad_group.name FROM ad_group WHERE campaign.id=23904343810 AND ad_group.name='Nisria Foundation'";
  const sr=await fetch(`${API}/customers/${cid}/googleAds:searchStream`,{method:"POST",headers:H,body:JSON.stringify({query:q})});
  const sj=await sr.json(); newAg=(Array.isArray(sj)?sj:[sj]).flatMap(b=>b.results||[])[0]?.adGroup?.resourceName;
}
if(DRY) newAg=`customers/${cid}/adGroups/DRYRUN`;
console.log("    ad group:",newAg||"(none)");

// 2 RSAs (Grants needs >=2 ads/ad group). Headlines <=30, descriptions <=90, no dashes.
const HEADLINES=["Nisria Childrens Charity","Sponsor a Child in Kenya","Support an Orphan Today","Change a Childs Life","Give Hope to Kenyan Kids","Donate to Nisria Inc","Help Vulnerable Children","Education for Orphans"];
const DESCS=["Nisria gives Kenyan orphans food, education and care. Sponsor a child today.","Your monthly gift transforms a childs future. Donate securely to Nisria.","Join Nisria supporting vulnerable children across Kenya. Every gift counts.","Mission driven nonprofit. Help feed, educate and protect children in need."];
const rsa=(hSlice,dSlice)=>({create:{adGroup:newAg,status:"ENABLED",ad:{finalUrls:["https://www.nisria.co/gift"],responsiveSearchAd:{headlines:hSlice.map(t=>({text:t})),descriptions:dSlice.map(t=>({text:t}))}}}});
if(newAg){
  await mutate("adGroupAds",[
    rsa(HEADLINES.slice(0,6),DESCS.slice(0,3)),
    rsa([HEADLINES[1],HEADLINES[2],HEADLINES[3],HEADLINES[6],HEADLINES[7],HEADLINES[0]],[DESCS[2],DESCS[3],DESCS[0]]),
  ],"2 RSAs");
  await mutate("adGroupCriteria",[
    {create:{adGroup:newAg,status:"ENABLED",keyword:{text:"nisria foundation",matchType:"PHRASE"}}},
    {create:{adGroup:newAg,status:"ENABLED",keyword:{text:"nisria charity organization",matchType:"PHRASE"}}},
    {create:{adGroup:newAg,status:"ENABLED",keyword:{text:"nisria nonprofit",matchType:"PHRASE"}}},
  ],"3 brand keywords");
}

// ---- 2. mission-relevant expansion keywords ----
// AGs: SponsorGeneral 197974518918, SponsorKenya 197974518718, Monthly 197974518878,
//      DonateCharity 197974519118, DonateKenya 197974519158, EduDonation 197974519198
const P="PHRASE",B="BROAD";
const KW=[
  // donor-research cluster (6,600/mo each, high intent)
  ["197974519118","best charities to donate to",P],["197974519118","good charities to donate to",P],
  ["197974519118","best childrens charity",P],["197974519118","best charity to donate to children",P],
  // child / orphan specific (mission-perfect → high QS even if lower vol)
  ["197974518918","sponsor a child in need",P],["197974518918","sponsor a poor child",P],
  ["197974518718","help orphans in africa",P],["197974518718","support an orphan",P],
  ["197974518878","child sponsorship programs",P],["197974518878","sponsor a child monthly",P],
  ["197974519158","charity for children in africa",P],["197974519158","help children in need",P],
  ["197974519198","childrens education charity",P],
];
console.log("\nSTEP 2 — mission-relevant expansion keywords:");
await mutate("adGroupCriteria",KW.map(([ag,text,matchType])=>({create:{adGroup:`customers/${cid}/adGroups/${ag}`,status:"ENABLED",keyword:{text,matchType}}})),`${KW.length} keywords`);
console.log("\nDone.");
