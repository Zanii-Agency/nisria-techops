// Zanii proof-of-action for Sasa. Every action tool emits a signed,
// hash-chained receipt to ledger.zanii.agency under Sasa's own agent DID
// (owner->agent delegation, scope *). The ledger stores only a hash; plaintext
// stays in Sasa's own DB.
//
// Fire-and-forget + no-op when ZANII_* env is absent, so it can never block or
// break a delivery. waitUntil keeps the receipt alive past the serverless
// response. Observe-only: records truth, does not gate any claim.

import { ZaniiAgent } from "@zanii/sdk";
import { waitUntil } from "@vercel/functions";

let agent: ZaniiAgent | null = null;
let tried = false;

function get(): ZaniiAgent | null {
  if (tried) return agent;
  tried = true;
  const did = process.env.ZANII_AGENT_DID;
  const priv = process.env.ZANII_AGENT_PRIVATE_KEY;
  const apiKey = process.env.ZANII_API_KEY;
  if (!did || !priv || !apiKey) return null; // unconfigured -> silent no-op
  try {
    agent = new ZaniiAgent({
      serverUrl: process.env.ZANII_LEDGER_URL || "https://ledger.zanii.agency",
      agentDid: did,
      agentPrivateKey: Uint8Array.from(Buffer.from(priv, "base64")),
      delegation: process.env.ZANII_DELEGATION ? JSON.parse(process.env.ZANII_DELEGATION) : [],
      apiKey,
    });
  } catch (e: any) {
    console.log(`[zanii] init failed: ${e?.message || e}`);
    agent = null;
  }
  return agent;
}

// Generic: record ANY action tool under its own `target`. Fire-and-forget,
// no-op when unconfigured, never throws.
export async function recordAction(target: string, payload: Record<string, unknown>): Promise<string | null> {
  const z = get();
  if (!z) return null;
  const work = (async () => {
    try {
      const { hash } = await z.record({ target, payload });
      await z.flush();
      return hash;
    } catch (e: any) {
      console.log(`[zanii] recordAction(${target}) failed: ${e?.message || e}`);
      return null;
    }
  })();
  // Vercel freezes the fn after the HTTP response, killing a bare fire-and-forget
  // before its ledger POST lands. waitUntil keeps the invocation alive. Guarded
  // for non-Vercel contexts (local/cron) where waitUntil is a no-op/throws.
  try { waitUntil(work); } catch { /* not in a Vercel request context */ }
  return work;
}
