import { useState } from "react";
import { api } from "./api";

export function Login({ onIn }: { onIn: () => void }) {
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(pass);
      onIn();
    } catch {
      setError("Wrong passphrase");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">Abbiss</div>
        <span className="eyebrow">Admin</span>
        <input
          type="password"
          autoFocus
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
        <button className="cta" disabled={busy || !pass}>{busy ? "…" : "Enter"}</button>
        {error && <p className="hint warn">{error}</p>}
      </form>
    </div>
  );
}
