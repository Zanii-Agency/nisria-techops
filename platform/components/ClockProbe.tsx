"use client";

import { useEffect } from "react";

// ClockProbe — feeds the ONE clock service (lib/now) the viewer's real timezone.
//
// On mount it reads the browser's resolved zone (Intl) and persists it to the
// `nis.tz` cookie, which lib/now.resolveTz() reads on the server for every date
// render. This is how cover letters, grant dates, and reports show the date in
// the user's own zone (falling back to the org tz, then UTC). Cookie-only, no
// network, no PII; runs once and is a no-op if the zone has not changed.
export default function ClockProbe() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const existing = document.cookie.split("; ").find((c) => c.startsWith("nis.tz="));
      const current = existing ? decodeURIComponent(existing.split("=")[1] || "") : "";
      if (current === tz) return;
      // 1-year cookie, lax so it travels on top-level navigations.
      document.cookie = `nis.tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Intl unavailable or cookie blocked — server falls back to org tz / UTC.
    }
  }, []);
  return null;
}
