export const dynamic = "force-dynamic";

export const metadata = {
  title: "Scheduled maintenance · Nisria Command Center",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="login-split">
      <div className="login-photo">
        <img src="/login-bg.jpg" alt="Nisria Safe House, Gilgil, Kenya" />
        <div className="login-photo-overlay" />
        <div className="login-photo-content">
          <img className="logo" src="/logo.png" alt="Nisria" />
          <h2>Where healing meets prosperity.</h2>
          <p>The command center for the Safe House, education, and rescue work in Gilgil, Kenya.</p>
        </div>
      </div>

      <div className="login-aside">
        <div className="login-card">
          <img className="logo" src="/logo.png" alt="Nisria" style={{ height: 32 }} />
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "5px 10px",
              borderRadius: 999,
              background: "rgba(217,119,6,0.10)",
              color: "#9A6500",
              border: "1px solid rgba(217,119,6,0.25)",
              marginTop: 14,
              alignSelf: "flex-start",
            }}
          >
            <span
              aria-hidden
              style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "#D97706" }}
            />
            Scheduled maintenance
          </div>
          <h1 style={{ marginTop: 14 }}>We are tightening Sasa.</h1>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.55 }}>
            The command center and the 727 WhatsApp bot are briefly offline while we ship
            a quality pass. Your data is untouched and the board state is preserved. We
            will be back shortly.
          </p>

          <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
            <StatusRow tone="warn" label="Portal" value="Locked, admin token bypass only" />
            <StatusRow tone="warn" label="WhatsApp bot" value="Replying with this notice to team and contacts" />
            <StatusRow tone="ok" label="Data" value="Read and write paused, nothing dropped" />
          </div>

          <a
            className="btn full"
            href="https://wa.me/971501168462"
            style={{ marginTop: 18, textDecoration: "none", textAlign: "center" }}
          >
            Message Taona on WhatsApp
          </a>
          <div className="login-foot">
            For anything urgent, reach Taona directly. He is the only operator on the line during the window.
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ tone, label, value }: { tone: "ok" | "warn"; label: string; value: string }) {
  const dot = tone === "ok" ? "#16A34A" : "#D97706";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(14,26,26,0.07)",
        background: "rgba(255,255,255,0.55)",
      }}
    >
      <span
        aria-hidden
        style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: dot, marginTop: 6, flex: "none" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: "#5F7574",
          }}
        >
          {label}
        </div>
        <div style={{ marginTop: 2, fontSize: 13.5, lineHeight: 1.4, color: "#0E1A1A" }}>{value}</div>
      </div>
    </div>
  );
}
