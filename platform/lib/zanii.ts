// Zanii proof-of-action for Sasa — HIERARCHICAL identity.
//
//   owner (Nur/Taona)  →  Sasa conductor (scope *)  →  each specialist (scoped
//   to its domain's manifest tools). Zanii enforces "narrow, never widen" down
//   the chain, so the money specialist can ONLY sign money actions, cryptograph-
//   ically mirroring the in-code hard-wall (getToolsForDomain / sasa.ts HARD WALL).
//
// recordAction(target, payload, domain): the specialist that OWNS the tool signs
// it; cross-cutting / unknown tools fall to the conductor (the accountable bot).
// So the on-chain signer MATCHES the enforced authority, and the delegation chain
// (owner→conductor→specialist) is provable end to end.
//
// Fire-and-forget + no-op when env absent (never breaks Sasa's send/honesty
// spine). waitUntil survives serverless suspend. Observe-only. Ledger stores only
// a hash; plaintext stays in Sasa's DB. One org write key (ZANII_API_KEY) is
// reused by every signer — the DID + delegation is what attributes/authorizes.

import { ZaniiAgent } from "@zanii/sdk";
import { waitUntil } from "@vercel/functions";

const ledger = () => process.env.ZANII_LEDGER_URL || "https://ledger.zanii.agency";

// The conductor: the accountable Sasa identity (owner→conductor, scope *).
let conductor: ZaniiAgent | null = null;
let conductorTried = false;
function getConductor(): ZaniiAgent | null {
  if (conductorTried) return conductor;
  conductorTried = true;
  const did = process.env.ZANII_AGENT_DID;
  const priv = process.env.ZANII_AGENT_PRIVATE_KEY;
  const apiKey = process.env.ZANII_API_KEY;
  if (!did || !priv || !apiKey) return null;
  try {
    conductor = new ZaniiAgent({
      serverUrl: ledger(), agentDid: did,
      agentPrivateKey: Uint8Array.from(Buffer.from(priv, "base64")),
      delegation: process.env.ZANII_DELEGATION ? JSON.parse(process.env.ZANII_DELEGATION) : [],
      apiKey,
    });
  } catch (e: any) { console.log(`[zanii] conductor init failed: ${e?.message || e}`); conductor = null; }
  return conductor;
}

// The specialists, keyed by domain. Each carries the FULL chain
// [owner→conductor, conductor→specialist] in its delegation.
let specialists: Record<string, ZaniiAgent> | null = null;
let specialistsTried = false;
function getSpecialists(): Record<string, ZaniiAgent> {
  if (specialistsTried) return specialists || {};
  specialistsTried = true;
  specialists = {};
  const b64 = process.env.ZANII_SPECIALISTS_B64;
  const apiKey = process.env.ZANII_API_KEY;
  if (!b64 || !apiKey) return specialists;
  try {
    const map = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, { did: string; priv: string; delegation: string }>;
    for (const [domain, s] of Object.entries(map)) {
      specialists[domain] = new ZaniiAgent({
        serverUrl: ledger(), agentDid: s.did,
        agentPrivateKey: Uint8Array.from(Buffer.from(s.priv, "base64")),
        delegation: JSON.parse(s.delegation),
        apiKey,
      });
    }
  } catch (e: any) { console.log(`[zanii] specialists init failed: ${e?.message || e}`); }
  return specialists;
}

export async function recordAction(target: string, payload: Record<string, unknown>, domain?: string): Promise<string | null> {
  // Pick the signer: the specialist that owns the tool, else the conductor.
  const agent = (domain ? getSpecialists()[domain] : undefined) || getConductor();
  if (!agent) return null;
  const work = (async () => {
    try {
      const { hash } = await agent.record({ target, payload });
      await agent.flush();
      return hash;
    } catch (e: any) {
      console.log(`[zanii] recordAction(${target}) failed: ${e?.message || e}`);
      return null;
    }
  })();
  try { waitUntil(work); } catch { /* not in a Vercel request context */ }
  return work;
}
