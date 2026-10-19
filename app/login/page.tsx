"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { safeReturnPath } from "../lib/auth/identity";
import { useAuth } from "../auth-context";
import { GoogleLink } from './google-link';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const { status, signIn, googleEnabled, legacyEnabled, member } = useAuth();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescueOpen, setRescueOpen] = useState(false);
  const linking = searchParams.get('link') === '1' && !rescueOpen;
  const requestedReturnTo = searchParams.get("returnTo");
  const returnTo = safeReturnPath(requestedReturnTo);
  const requiresIndividual = returnTo.startsWith("/oauth/");

  useEffect(() => {
    if (status === "authenticated" && (member || !requiresIndividual)) window.location.replace(returnTo);
  }, [returnTo, status, member, requiresIndividual]);

  const authError = searchParams.get('authError');
  const oauthMessage = authError === 'unauthorized' ? 'Ce compte Google n’est pas autorisé à accéder au CRM Équipe Forbes.'
    : authError === 'domain' ? 'Ce compte Google ne fait pas partie des domaines autorisés de l’Équipe Forbes.'
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

  async function openRescue() {
    setError(null);
    try {
      const response = await fetch('/api/access/google/reset', { method: 'POST' });
      if (!response.ok) throw new Error('Veuillez réessayer.');
      setRescueOpen(true);
    } catch { setError('Impossible de préparer la connexion de secours. Veuillez réessayer.'); }
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
        {linking ? <GoogleLink returnTo={returnTo} onAnotherAccount={() => void googleSignIn()} onRescue={() => void openRescue()} /> : googleEnabled && <button className="login-submit" disabled={isSubmitting} type="button" onClick={() => void googleSignIn()}>
          <span aria-hidden="true" className="login-google-icon">G</span>
          {isSubmitting ? 'CONNEXION…' : authError ? 'Utiliser un autre compte Google' : 'Continuer avec Google'}
        </button>}
        {requiresIndividual && !googleEnabled && <p role="status">La connexion Google individuelle est en préparation.</p>}
        {legacyEnabled && !requiresIndividual && !linking && <>
        {!rescueOpen && googleEnabled && <div className="login-rescue"><p>Problème de connexion ?</p><button className="login-help" type="button" onClick={() => void openRescue()}>Connexion de secours</button></div>}
        {(rescueOpen || !googleEnabled) && <div className="login-form">
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="password">
            <span>Mot de passe</span>
            <input id="password" name="password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>

          <button className="login-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "VÉRIFICATION…" : "ENTRER"}
          </button>
        </form></div>}</>}
      </section>
    </main>
  );
}
