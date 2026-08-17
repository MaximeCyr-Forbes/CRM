"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth-context";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { status, signIn } = useAuth();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedReturnTo = searchParams.get("returnTo");
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
    ? requestedReturnTo
    : "/";

  useEffect(() => {
    if (status === "authenticated") window.location.replace(returnTo);
  }, [returnTo, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await signIn(password);
      window.location.replace(returnTo);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Mot de passe incorrect");
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-ambient login-ambient-one" aria-hidden="true" />
      <div className="login-ambient login-ambient-two" aria-hidden="true" />
      <section className="login-card" aria-labelledby="login-title">
        <header className="login-brand">
          <p>ÉQUIPE FORBES</p>
          <h1 id="login-title">CRM</h1>
        </header>
        <form className="login-form" onSubmit={submit}>
          <label>
            <span>Mot de passe</span>
            <input autoComplete="current-password" autoFocus onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
          <button className="login-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "VÉRIFICATION…" : "ENTRER"}
          </button>
        </form>
      </section>
    </main>
  );
}
