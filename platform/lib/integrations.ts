// lib/integrations.ts — the integration connector store (R3-5 / P12, img 171).
//
// The founder: "this is where Zanii should be integrated into the platform, at
// least the key details, I will give you the code for that later, so for now it
// can just be what we want it to be." So we model the SHAPE of the integration
// now, stored on the existing `connector_registry` table (the platform already
// uses it for Gmail/Givebutter/etc.), in its `config` jsonb. When Nur hands over
// the real Zanii code, wiring it is a job of reading these fields + flipping
// `enabled`, NOT a redesign: the fields, the storage, and the Settings card are
// already here. We do NOT fake a working sync; the status is honestly "stub,
// awaiting code."
//
// One row per integration (key = "zanii"). The card reads getIntegration() and
// the save action writes saveIntegrationConfig(). Nothing here pretends to call
// an external API.

import { admin } from "./supabase-admin";
import { emit } from "./events";

export type IntegrationConfig = {
  api_key?: string;
  workspace_id?: string;
  account_id?: string;
  base_url?: string;
  syncs?: string;
  status_note?: string;
  stub?: boolean;
  awaiting_code?: boolean;
};

export type Integration = {
  key: string;
  name: string;
  kind: string | null;
  mechanism: string | null;
  enabled: boolean;
  health: string | null;
  capabilities: string[];
  config: IntegrationConfig;
};

// The fields the Zanii stub exposes in the Settings card. Editing/storing them
// now means dropping in the real Zanii code later only has to READ these, never
// add a new form. `secret` fields are masked in the UI; `code` is what the founder
// will provide, so it stays read-only-informational until then.
export const ZANII_FIELDS: { key: keyof IntegrationConfig; label: string; secret?: boolean; hint?: string }[] = [
  { key: "api_key", label: "Zanii API key", secret: true, hint: "Paste when Nur provides the Zanii code." },
  { key: "workspace_id", label: "Workspace ID", hint: "The Zanii workspace this org maps to." },
  { key: "account_id", label: "Account ID", hint: "The Zanii Ads account to read spend from." },
  { key: "base_url", label: "API base URL", hint: "Defaults to https://zanii.agency." },
  { key: "syncs", label: "What it syncs", hint: "What data flows between Zanii and the Command Center." },
];

function asConfig(raw: any): IntegrationConfig {
  return (raw && typeof raw === "object" ? raw : {}) as IntegrationConfig;
}
function asCaps(raw: any): string[] {
  return Array.isArray(raw) ? raw.map((x) => String(x)) : [];
}

// Read one integration connector row by key (e.g. "zanii"). Returns null if the
// row is missing (the Zanii row is seeded via the management API in R3-5).
export async function getIntegration(key: string): Promise<Integration | null> {
  const { data } = await admin()
    .from("connector_registry")
    .select("key,name,kind,mechanism,enabled,health,capabilities,config")
    .eq("key", key)
    .maybeSingle();
  if (!data) return null;
  return {
    key: data.key,
    name: data.name,
    kind: data.kind ?? null,
    mechanism: data.mechanism ?? null,
    enabled: !!data.enabled,
    health: data.health ?? null,
    capabilities: asCaps(data.capabilities),
    config: asConfig(data.config),
  };
}

// List the integration-kind connectors (so the card could show others later).
export async function listIntegrations(): Promise<Integration[]> {
  const { data } = await admin()
    .from("connector_registry")
    .select("key,name,kind,mechanism,enabled,health,capabilities,config")
    .eq("kind", "integration")
    .order("name");
  return ((data || []) as any[]).map((d) => ({
    key: d.key, name: d.name, kind: d.kind ?? null, mechanism: d.mechanism ?? null,
    enabled: !!d.enabled, health: d.health ?? null, capabilities: asCaps(d.capabilities), config: asConfig(d.config),
  }));
}

// Merge-save the config jsonb for an integration. Only the keys passed are
// changed (so an empty secret field never clobbers a stored key by accident on a
// blank save). Does NOT enable the connector or pretend it works: while it is a
// stub the health stays "stub". Returns the updated config.
export async function saveIntegrationConfig(key: string, patch: IntegrationConfig): Promise<{ ok: boolean; config?: IntegrationConfig; error?: string }> {
  const db = admin();
  const existing = await getIntegration(key);
  if (!existing) return { ok: false, error: "Integration not found." };

  // only overwrite a field when the caller actually sent a non-empty value, so a
  // form that leaves a secret blank does not wipe a previously stored secret.
  const merged: IntegrationConfig = { ...existing.config };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "" && k === "api_key") continue; // keep stored secret on blank
    (merged as any)[k] = v;
  }
  merged.stub = true;
  merged.awaiting_code = true;

  const { error } = await db.from("connector_registry").update({ config: merged }).eq("key", key);
  if (error) return { ok: false, error: error.message };
  await emit({ type: "integration.config_saved", source: "settings", actor: "Nur", subject_type: "connector", payload: { key } });
  return { ok: true, config: merged };
}
