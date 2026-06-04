// Person-name formatting for intakes (cases + beneficiaries).
//
// The WhatsApp intake sometimes lands a whole family phrase in the name field,
// e.g. "Mercy Wanjiku and her children Princess and Tony". On a card that reads
// as an unformatted sentence. This helper pulls the PRIMARY name to lead, and
// returns any dependents separately so the UI can show them as a quiet chip
// rather than jamming them into the name. It also tidies casing when a value is
// clearly unformatted (ALL CAPS or all lowercase), but never re-cases a name that
// is already mixed-case (so "Ibrahim Mwaura (John Kamau)" is left exactly as is).

const SMALL = new Set(["and", "her", "his", "their", "of", "the", "to", "for", "a", "an", "na", "wa", "bin", "binti"]);

// Only ever called on a uniformly-cased string (all caps or all lower), so we can
// safely title-case every token. Mixed-case values never reach here (clean()
// leaves them untouched), which is why there is no "already styled" guard.
function titleCaseSmart(s: string): string {
  const words = s.split(" ");
  return words
    .map((w, i) => {
      if (!w) return w;
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

// Tidy whitespace; only re-case when the whole string is one case (clearly raw).
function clean(raw: string): string {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const hasLower = /[a-z]/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  const isAllCaps = hasUpper && !hasLower;
  const isAllLower = hasLower && !hasUpper;
  return isAllCaps || isAllLower ? titleCaseSmart(s) : s;
}

export type FormattedName = { name: string; dependents: string[] };

export function formatPersonName(raw: any): FormattedName {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return { name: "", dependents: [] };

  // "<primary> and her/his/their child(ren)/kids/son/daughter/family : <names>"
  const fam = s.match(
    /^(.*?)\s+(?:and|&|with)\s+(?:her|his|their)\s+(?:children|child|kids|sons?|daughters?|family|dependants?|dependents?)\b[:\-\s]*(.*)$/i,
  );
  let primary = s;
  let rest = "";
  if (fam) {
    primary = fam[1].trim();
    rest = (fam[2] || "").trim();
  } else {
    // "<primary> and family" / "<primary> & family"
    const f2 = s.match(/^(.*?)\s+(?:and|&)\s+family$/i);
    if (f2) primary = f2[1].trim();
  }

  const dependents = rest
    ? rest
        .split(/\s*(?:,|&|\band\b)\s*/i)
        .map((x) => clean(x))
        .filter(Boolean)
    : [];

  return { name: clean(primary) || s, dependents };
}
