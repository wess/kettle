import { useEffect, useState } from "react"
import * as api from "../api.ts"

export const Login = ({ onLogin }: { onLogin: () => void }) => {
  const [setup, setSetup] = useState<boolean | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api
      .checkSetup()
      .then((s) => setSetup(s.needsSetup))
      .catch(() => setSetup(false))
  }, [])

  const submit = async () => {
    setError("")
    if (setup && password !== confirm) return setError("Passwords don't match")
    setBusy(true)
    try {
      if (setup) await api.signup(email, password)
      else await api.login(email, password)
      onLogin()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: { key: string }) => e.key === "Enter" && submit()

  return (
    <div className="authwrap">
      <div className="card authcard">
        <div className="brand">
          <div className="logo">🫖</div>
          <b>Kettle</b>
        </div>
        <h2>{setup ? "Create admin account" : "Sign in"}</h2>
        <p className="sub">
          {setup
            ? "This is a fresh instance. The first account you create is the admin."
            : "Deploy and manage your apps on krillin."}
        </p>
        {error && <div className="err">{error}</div>}
        <div className="field">
          <label>Email</label>
          <input
            className="input"
            type="email"
            value={email}
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKey}
          />
          {setup && <span className="hint">At least 8 characters.</span>}
        </div>
        {setup && (
          <div className="field">
            <label>Confirm password</label>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={onKey}
            />
          </div>
        )}
        <button
          className="btn primary"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={submit}
          disabled={busy || setup === null}
        >
          {busy ? (setup ? "Creating…" : "Signing in…") : setup ? "Create account" : "Sign in"}
        </button>
      </div>
    </div>
  )
}
