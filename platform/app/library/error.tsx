"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <div className="card" style={{ padding: 22, margin: "16px auto", maxWidth: 640, textAlign: "center" }}><span style={{ color: "var(--danger)" }}>Something went wrong.</span><br /><button onClick={reset} className="btn sm teal" style={{ marginTop: 12 }}>Try again</button></div>;
}
