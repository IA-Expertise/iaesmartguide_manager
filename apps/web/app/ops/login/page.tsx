"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../ops.module.css";

export default function OpsLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/ops/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Não foi possível entrar");
        return;
      }

      router.push("/ops");
      router.refresh();
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.loginPage}>
      <div className={styles.loginCard}>
        <h1>IAE Ops</h1>
        <p className={styles.loginHint}>Painel operacional — acesso restrito</p>
        <form onSubmit={onSubmit} className={styles.loginForm}>
          <label htmlFor="ops-password">Senha</label>
          <input
            id="ops-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className={styles.loginError}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
