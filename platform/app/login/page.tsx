"use client";

import { useFormState } from "react-dom";
import { login } from "./actions";

const initial: { error?: string } = {};

export default function LoginPage() {
  const [state, action] = useFormState(login, initial);
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
        <form className="login-card" action={action}>
          <img className="logo" src="/logo.png" alt="Nisria" style={{ height: 32 }} />
          <h1>Welcome back</h1>
          <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>Sign in to the command center.</p>
          <label style={{ display: "block", margin: "20px 0 7px" }}>Password</label>
          <input type="password" name="password" autoFocus placeholder="••••••••" />
          <button className="btn full" type="submit" style={{ marginTop: 14 }}>Sign in</button>
          {state?.error && <div className="err">{state.error}</div>}
          <div className="login-foot">Internal platform · holds donor &amp; beneficiary data. Do not share access.</div>
        </form>
      </div>
    </div>
  );
}
