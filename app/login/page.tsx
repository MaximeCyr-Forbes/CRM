"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { safeReturnPath } from "../lib/auth/identity";
import { useAuth } from "../auth-context";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { status, signIn, googleEnabled, legacyEnabled, member } = useAuth();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestedReturnTo = searchParams.get("returnTo");
  const returnTo = safeReturnPath(requestedReturnTo);
  const requiresIndividual = returnTo.startsWith("/oauth/");

  useEffect(() => {
    if (status === "authenticated" && (member || !requiresIndividual)) window.location.replace(returnTo);
  }, [returnTo, status, member, requiresIndividual]);

  const authError = searchParams.get('authError');
  const oauthMessage = authError === 'unauthorized' ? 'Ce compte Google n’est pas autorisé à accéder au CRM Équipe Forbes.'
    : authError === 'cancelled' ? 'Connexion annulée. Vous pouvez réessayer.'
    : authError ? 'Impossible de terminer la connexion. Veuillez réessayer.' : null;
  async function googleSignIn() {
    setIsSubmitting(true); setError(null);
    try {
      const response = await fetch('/api/access/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnTo }) });
      const result = await response.json();
      if (!response.ok || typeof result.url !== 'string') throw new Error(result.error ?? 'Connexion Google indisponible.');
      window.location.assign(result.url);
    } catch (err) { setError(err instanceof Error ? err.message : 'Connexion Google indisponible.'); setIsSubmitting(false); }
  }

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
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-brand">
          <p>ÉQUIPE FORBES</p>
          <h1 id="login-title">CRM</h1>
        </header>
        {(error || oauthMessage) && <p className="auth-message auth-message-error" role="alert">{error || oauthMessage}</p>}
        {googleEnabled && <button className="login-submit" disabled={isSubmitting} type="button" onClick={() => void googleSignIn()}>
          {isSubmitting ? 'CONNEXION…' : authError === 'unauthorized' ? 'Utiliser un autre compte Google' : 'Continuer avec Google'}
        </button>}
        {requiresIndividual && !googleEnabled && <p role="status">La connexion Google individuelle est en préparation.</p>}
        {legacyEnabled && !requiresIndividual && <details open={!googleEnabled} className="login-form"><summary>Accès temporaire de l’équipe</summary>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="password">
            <span>Mot de passe</span>
            <input id="password" name="password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>

          <button className="login-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "VÉRIFICATION…" : "ENTRER"}
          </button>
        </form></details>}
      </section>
    </main>
  );
}
