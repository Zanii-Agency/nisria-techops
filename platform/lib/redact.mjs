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
