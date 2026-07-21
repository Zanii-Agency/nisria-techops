// Secret redaction for the message LOG + MIRROR (2026-07-01). Nur can save a login
// by WhatsApp ("save my Mailchimp login, user X password Y") — the password is sealed
// AES-256 into the vault, but the raw inbound would otherwise sit in plaintext in the
// messages log AND be mirrored to Taona. This masks credential values BEFORE they are
// logged/mirrored. The WORKER still gets the raw text via the job payload, so the seal
// still works; only the persisted/mirrored copy is masked.
//
// Conservative: only masks a value that FOLLOWS a credential keyword, so ordinary
// messages are untouched, and a QUESTION ("what is my password?") with no value is left
// alone (nothing to hide).
const SECRET_RE = /\b(password|passphrase|passwd|pass|pwd|\bpw\b|pin|otp|secret|api[\s_-]?key|token)\b\s*(?:is|are|:|=|->|=>)?\s*(["'`]?)([^\s"'`]{3,})\2/gi;

export function redactSecrets(text) {
  if (!text) return text;
  return String(text).replace(SECRET_RE, (_m, kw) => `${kw}: ••••••`);
}

// Does this message look like it carries a credential? (Used to decide whether a
// message needs post-hoc scrub / special handling.) Same signal as the masker.
export function looksLikeSecret(text) {
  if (!text) return false;
  SECRET_RE.lastIndex = 0;
  return SECRET_RE.test(String(text));
}

// SIGNED STORAGE URLS MUST NEVER REACH THE MODEL (2026-07-20 live incident).
//
// create_letterhead_doc sends the PDF as a real WhatsApp document via sendDocument,
// and separately returned the signed Supabase URL on `detail.file_url`. The whole
// tool result is JSON.stringify'd back to the model (sasa.ts, tool_result), so the
// model saw the URL and helpfully pasted it into the reply. WhatsApp flagged the
// message as a suspicious link and the operator saw a broken-looking blob instead of
// the file that had already been delivered.
//
// This exact failure was diagnosed and fixed on 2026-07-11 for project_expense_report,
// whose comment still reads: "NEVER puts the storage URL in the reply text (a raw
// signed link is what trips WhatsApp's suspicious link flag)". That fix was applied to
// ONE tool. Its sibling in the same file kept the bug for nine days. Fixing an
// instance of a class leaves the class alive, so this guard lives at the seam every
// tool result passes through, not in a tool.
//
// Only SIGNED object-storage URLs are masked. A saved bookmark from get_resource, a
// public asset link, a normal https link the operator shared: all untouched. The real
// URL still reaches toolRuns (receipts, telemetry, the composer) because only the
// model-facing copy is redacted.
const SIGNED_URL_RE = /https?:\/\/[^\s"'\\]*\/storage\/v1\/object\/(?:sign|upload\/sign)\/[^\s"'\\]*/gi;

export function redactSignedUrls(text) {
  if (!text) return text;
  return String(text).replace(SIGNED_URL_RE, "[file delivered as an attachment]");
}

export function hasSignedUrl(text) {
  if (!text) return false;
  SIGNED_URL_RE.lastIndex = 0;
  return SIGNED_URL_RE.test(String(text));
}
