#!/usr/bin/env node
// Watches the Nisria Ad Grants account; the FIRST time it sees impressions (ads
// actually serving), it pings Taona on the 727 WhatsApp line via the approved
// operator_update template, then self-retires (removes its own launchd job).
// Run modes: (default) check+maybe-ping ; --arm sends a one-time "armed" ping ;
// --test prints metrics only (no send).
import crypto from "node:crypto"; import { execSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";

const API="https://googleads.googleapis.com/v22", SCOPE="https://www.googleapis.com/auth/adwords", SUBJECT="sasa@nisria.co";
const GRAPH="https://graph.facebook.com/v21.0";
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const cid="2028365929";
const SENTINEL="/Users/milaaj/.nisria-gads-watch.fired";
const JOB_LABEL="co.nisria.gads-watch";
const PLIST=`/Users/milaaj/Library/LaunchAgents/${JOB_LABEL}.plist`;
const MODE = process.argv.includes("--arm") ? "arm" : process.argv.includes("--test") ? "test" : "check";

function ev(n){if(process.env[n])return process.env[n];for(const f of[".env.local",".env.seed",".env"]){const p=path.join(__dirname,"..",f);if(!fs.existsSync(p))continue;const l=fs.readFileSync(p,"utf8").split(/\r?\n/).find(x=>x.startsWith(n+"="));if(l)return l.slice(n.length+1).replace(/^["']|["']$/g,"");}return null;}
function kc(a){try{return execSync(`security find-generic-password -a "${a}" -w`,{encoding:"utf8"}).trim();}catch{return null;}}
const log=(m)=>console.log(`[${new Date().toISOString()}] ${m}`);

async function adsToken(){
  const j=JSON.parse(Buffer.from(ev("GOOGLE_SERVICE_ACCOUNT_B64"),"base64").toString("utf8"));
  const now=Math.floor(Date.now()/1000),b64u=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
  const inp=`${b64u({alg:"RS256",typ:"JWT"})}.${b64u({iss:j.client_email,sub:SUBJECT,scope:SCOPE,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})}`;
  const sig=crypto.sign("RSA-SHA256",Buffer.from(inp),j.private_key).toString("base64url");
  for(let i=0;i<4;i++){ // retry: UND_ERR_CONNECT_TIMEOUT is common
    try{
      const r=await(await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${inp}.${sig}`})})).json();
      if(r.access_token)return r.access_token;
    }catch(e){ log(`token retry ${i+1}: ${e.message}`); }
  }
  throw new Error("ads token mint failed after retries");
}

async function metrics(){
  const tok=await adsToken();
  const dt=process.env.GOOGLE_ADS_DEVELOPER_TOKEN||kc("nisria-google-ads-dev-token");
  const q="SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM customer WHERE segments.date DURING LAST_7_DAYS";
  const r=await fetch(`${API}/customers/${cid}/googleAds:searchStream`,{method:"POST",headers:{authorization:`Bearer ${tok}`,"developer-token":dt,"content-type":"application/json"},body:JSON.stringify({query:q})});
  const j=await r.json();
  if(!r.ok)throw new Error("gaql: "+JSON.stringify(j).slice(0,300));
  const rows=(Array.isArray(j)?j:[j]).flatMap(b=>b.results||[]);
  let imp=0,clk=0,cost=0,conv=0;
  for(const row of rows){const m=row.metrics||{};imp+=Number(m.impressions||0);clk+=Number(m.clicks||0);cost+=Number(m.costMicros||0)/1e6;conv+=Number(m.conversions||0);}
  return {imp,clk,cost,conv};
}

async function ping(body){
  const token=kc("nisria-whatsapp-token");
  const owner=kc("nisria-owner-whatsapp");
  const phoneId=ev("WHATSAPP_PHONE_NUMBER_ID");
  if(!token||!owner||!phoneId){log("ping aborted: missing token/owner/phoneId");return false;}
  const oneLine=String(body).replace(/\s+/g," ").slice(0,900);
  const r=await fetch(`${GRAPH}/${phoneId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({
    messaging_product:"whatsapp",recipient_type:"individual",to:owner,type:"template",
    template:{name:"operator_update",language:{code:"en_US"},components:[{type:"body",parameters:[{type:"text",text:"Taona"},{type:"text",text:oneLine}]}]},
  })});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){log("ping failed: "+JSON.stringify(j).slice(0,300));return false;}
  log("ping sent, wamid="+(j.messages?.[0]?.id||"?"));
  return true;
}

function retire(){
  try{execSync(`launchctl bootout gui/$(id -u)/${JOB_LABEL}`,{stdio:"ignore"});}catch{}
  try{fs.rmSync(PLIST);}catch{}
  log("watcher retired (launchd job + plist removed)");
}

// ---- main ----
if(MODE==="arm"){
  const ok=await ping("Your Google Ads monitor is now ARMED on the Nisria Grant account. I fixed the zero-impression problem (switched to Maximize Conversions, added real-demand keywords). I will message you here the moment the ads start serving impressions. No action needed from you.");
  log(ok?"armed ping delivered":"armed ping failed");
  process.exit(ok?0:1);
}
const m=await metrics();
log(`metrics(7d): impressions=${m.imp} clicks=${m.clk} cost=$${m.cost.toFixed(2)} conversions=${m.conv}`);
if(MODE==="test"){process.exit(0);}
if(fs.existsSync(SENTINEL)){log("already fired (sentinel present), nothing to do.");process.exit(0);}
if(m.imp>0){
  const body=`Your Google Ads are now LIVE and serving. Last 7 days on the Nisria Grant account: ${m.imp} impressions, ${m.clk} clicks, $${m.cost.toFixed(2)} spent, ${m.conv} conversions. The fix worked. I will keep optimising from here.`;
  const ok=await ping(body);
  if(ok){fs.writeFileSync(SENTINEL,new Date().toISOString());retire();}
  process.exit(ok?0:1);
}else{
  log("still 0 impressions, will check again next run.");
  process.exit(0);
}
