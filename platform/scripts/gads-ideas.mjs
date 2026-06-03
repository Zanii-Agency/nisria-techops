#!/usr/bin/env node
// Keyword IDEAS discovery — finds high-volume, mission-relevant terms to expand the account.
import crypto from "node:crypto"; import { execSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const API="https://googleads.googleapis.com/v22", SCOPE="https://www.googleapis.com/auth/adwords", SUBJECT="sasa@nisria.co";
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const cid=process.argv[2]||"2028365929";
function ev(n){if(process.env[n])return process.env[n];for(const f of[".env.local",".env.seed",".env"]){const p=path.join(__dirname,"..",f);if(!fs.existsSync(p))continue;const l=fs.readFileSync(p,"utf8").split(/\r?\n/).find(x=>x.startsWith(n+"="));if(l)return l.slice(n.length+1).replace(/^["']|["']$/g,"");}return null;}
const dt=process.env.GOOGLE_ADS_DEVELOPER_TOKEN||execSync('security find-generic-password -a "nisria-google-ads-dev-token" -w',{encoding:"utf8"}).trim();
const j=JSON.parse(Buffer.from(ev("GOOGLE_SERVICE_ACCOUNT_B64"),"base64").toString("utf8"));
const now=Math.floor(Date.now()/1000),b64u=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const inp=`${b64u({alg:"RS256",typ:"JWT"})}.${b64u({iss:j.client_email,sub:SUBJECT,scope:SCOPE,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
const sig=crypto.sign("RSA-SHA256",Buffer.from(inp),j.private_key).toString("base64url");
const tok=(await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${inp}.${sig}`})})).json()).access_token;
const m=$=>($==null?null:Number($)/1e6);
const body={
  keywordSeed:{keywords:["sponsor a child","child sponsorship","donate to charity","sponsor an orphan","feed the children","help orphans","children's education charity","african charity","kenya charity"]},
  geoTargetConstants:["geoTargetConstants/2840","geoTargetConstants/2826","geoTargetConstants/2124"], // US UK CA
  language:"languageConstants/1000", keywordPlanNetwork:"GOOGLE_SEARCH",
};
const r=await fetch(`${API}/customers/${cid}:generateKeywordIdeas`,{method:"POST",headers:{authorization:`Bearer ${tok}`,"developer-token":dt,"content-type":"application/json"},body:JSON.stringify(body)});
const t=await r.text(); let d; try{d=JSON.parse(t)}catch{console.error(t.slice(0,500));process.exit(1)}
if(!r.ok){console.error("HTTP",r.status,JSON.stringify(d).slice(0,800));process.exit(1)}
const rows=(d.results||[]).map(x=>{const k=x.keywordIdeaMetrics||{};return{kw:x.text,vol:k.avgMonthlySearches?Number(k.avgMonthlySearches):0,comp:k.competition||"-",lo:m(k.lowTopOfPageBidMicros),hi:m(k.highTopOfPageBidMicros)};});
// Mission-relevant filter: 2+ words, donation/child/orphan/charity intent, decent volume
const bad=/free|job|template|quote|salary|near me|volunteer hours|tax|definition|meaning|images|clipart/i;
const good=rows.filter(x=>x.vol>=150 && x.kw.trim().split(/\s+/).length>=2 && !bad.test(x.kw) && /(sponsor|orphan|donat|charit|child|africa|kenya|feed|give|fund|support)/i.test(x.kw));
good.sort((a,b)=>b.vol-a.vol);
console.log("candidate keywords (vol>=150, 2+ words, mission-relevant):");
console.log("kw".padEnd(40),"vol".padStart(8),"comp".padStart(8),"loBid".padStart(8),"hiBid".padStart(8));
for(const x of good.slice(0,40)) console.log(x.kw.padEnd(40),String(x.vol).padStart(8),String(x.comp).padStart(8),(x.lo!=null?"$"+x.lo.toFixed(2):"-").padStart(8),(x.hi!=null?"$"+x.hi.toFixed(2):"-").padStart(8));
