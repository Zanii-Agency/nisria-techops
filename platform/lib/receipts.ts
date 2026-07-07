// RECEIPTS (Option-B honest spine, Slice 1). The DB wiring around the pure core.
// This is the `recordReceipt()` / `verifyClaim()` SEAM from ADR-0016: the local
// Postgres `receipts` table is the diary now; ledger.zanii.agency plugs in behind
// this same seam later as an adapter (Phase 4), no caller rework.
//
// The flag RELAY_HONEST_SPINE gates the CLAIM GATE in sasa.ts (off = live bot
// unchanged, strangler-safe). recordReceipt is always best-effort: it never throws
// and is a no-op if the table is absent, so nothing here can break a live turn.

import {
  relayProof,
  relayProofs,
  verifyRelayReceipt,
  claimsRelayWithoutReceipt,
  receiptFromRelay,
  RELAY_TOOLS,
  CLAIM_SHAPES,
  NOT_A_CLAIM,
} from "./receipts-core.mjs";

export { relayProof, relayProofs, verifyRelayReceipt, claimsRelayWithoutReceipt, receiptFromRelay, RELAY_TOOLS, CLAIM_SHAPES, NOT_A_CLAIM };

// Slice-1 flag. The gate only enforces when this is explicitly "on".
export function relaySpineOn(): boolean {
  return String(process.env.RELAY_HONEST_SPINE || "").toLowerCase() === "on";
}

export interface ReceiptRecord {
  turn_id: string | null;
  action: string;
  tool?: string | null;
  recipient_id?: string | null;
  recipient_last4?: string | null;
  provider: string;
  provider_id: string;
  meta?: Record<string, unknown> | null;
}

// Persist a receipt (the diary). Best-effort: never throws, never blocks a send.
// A missing `receipts` table (migration not yet run) is swallowed silently, so
// this is safe to wire in dark before the table exists.
export async function recordReceipt(db: any, r: ReceiptRecord): Promise<void> {
  try {
    if (!db || !r?.provider_id) return;
    await db.from("receipts").insert({
      turn_id: r.turn_id,
      action: r.action,
      tool: r.tool ?? null,
      recipient_id: r.recipient_id ?? null,
      recipient_last4: r.recipient_last4 ?? null,
      provider: r.provider,
      provider_id: r.provider_id,
      meta: r.meta ?? null,
    });
  } catch {
    // Diary write is best-effort. The turn-scoped gate (verifyRelayReceipt on
    // toolRuns) does not depend on this row, so a failed insert never lets a lie
    // through; it only means this action is missing from the persisted ledger.
  }
}

// Convenience: record a relay's receipt straight from its tool result.
export async function recordRelayReceipt(
  db: any,
  args: { turnId: string | null; toolName: string; result: any; recipientId?: string | null },
): Promise<void> {
  const rec = receiptFromRelay({
    turnId: args.turnId,
    toolName: args.toolName,
    result: args.result,
    recipientId: args.recipientId ?? null,
  });
  if (rec) await recordReceipt(db, rec as ReceiptRecord);
}
