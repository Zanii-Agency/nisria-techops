#!/usr/bin/env node
// Sets up the A/B experiment on the Nisria Grant account:
//  (1) bidding variation: Donate -> Maximize Clicks ($2 cap) as the forced-bid arm;
//      Sponsor + Brand stay Maximize Conversions (smart-bid arm, CTR-exempt).
//  (2) creative variation: add a 3rd distinct-angle RSA to the two main ad groups.
// All Grant-compliant. Run once.
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
  if(!r.ok){console.error(`  ❌ ${label}: HTTP ${r.status}\n${text.slice(0,800)}`);return {results:[]};}
  const ok=(res.results||[]).filter(x=>x&&x.resourceName).length; const pf=res.partialFailureError;
  console.log(`  ✅ ${label}: ${ok}/${operations.length}${pf?` (skipped: ${(pf.message||"").slice(0,140)})`:""}`);
  return res;
}

// ---- 1. Bidding variation: Donate (23904343816) -> Maximize Clicks, $2 cap ----
console.log("STEP 1 — bidding variation: Donate -> Maximize Clicks ($2 cap) [forced-bid arm]:");
await mutate("campaigns",[{
  update:{resourceName:`customers/${cid}/campaigns/23904343816`,targetSpend:{cpcBidCeilingMicros:"2000000"}},
  updateMask:"target_spend.cpc_bid_ceiling_micros",
}],"Donate bidding");

// ---- 2. Creative variation: 3rd-angle RSA on the two main ad groups ----
const URL="https://www.nisria.co/gift";
const rsa=(ag,h,d)=>({create:{adGroup:`customers/${cid}/adGroups/${ag}`,status:"ENABLED",ad:{finalUrls:[URL],responsiveSearchAd:{headlines:h.map(t=>({text:t})),descriptions:d.map(t=>({text:t}))}}}});
// Sponsor a Child General (197974518918) — angle: impact specificity
const sponsorH=["Feed a Child for $1 a Day","$40 Changes a Childs Month","Sponsor From $25 a Month","Direct Impact in Kenya","See Your Childs Progress","100% Reaches the Child","Real Kids, Real Change","Sponsor a Child Today"];
const sponsorD=["For the price of a coffee a day, give a Kenyan child food, school and care.","Sponsor a child from $25 a month and see the difference you make.","Every dollar reaches the children of Kenya. Start sponsoring today.","Transparent and mission driven. Change one childs life this month."];
// Donate Childrens Charity (197974519118) — angle: urgency / trust
const donateH=["Donate to Nisria Today","Trusted Childrens Charity","Help Kenyan Kids Now","Your Gift Feeds a Child","Give Where It Matters","Safe, Secure Donation","Support Orphans in Kenya","Make a Real Difference"];
const donateD=["Nisria is a mission driven nonprofit caring for Kenyan children. Give today.","Your secure donation feeds, educates and protects vulnerable children.","Join donors changing childrens lives across Kenya. Every gift counts.","Trusted, transparent giving, 100% focused on children in need."];
console.log("\nSTEP 2 — creative variation: 3rd-angle RSA on 2 main ad groups:");
await mutate("adGroupAds",[rsa("197974518918",sponsorH,sponsorD),rsa("197974519118",donateH,donateD)],"2 variant RSAs");
console.log("\nDone. Arms live: Sponsor+Brand=MaxConversions, Donate=MaxClicks. Optimizer will compare + decide.");
