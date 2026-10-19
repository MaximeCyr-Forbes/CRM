"use client";
import { useEffect, useState, type FormEvent } from 'react';
export function GoogleLink({ returnTo, onAnotherAccount, onRescue }: { returnTo: string; onAnotherAccount: () => void; onRescue: () => void }) {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [memberId, setMemberId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetch('/api/access/google/link', { cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!active) return;
      if (data.status === 'ready') { window.location.replace(returnTo); return; }
      if (data.status !== 'link_required') throw new Error('Relancez la connexion Google ou utilisez la connexion de secours.');
      setMembers(data.members);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Connexion indisponible.'); });
    return () => { active = false; };
  }, [returnTo]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/access/google/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Association indisponible.');
      window.location.replace(returnTo);
    } catch (err) { setError(err instanceof Error ? err.message : 'Association indisponible.'); setPassword(''); setBusy(false); }
  }
  return <div className="login-form">
    <h2>Première connexion</h2>
    <p>Associez votre compte Google à votre profil Équipe Forbes. Cette confirmation n’est nécessaire qu’une seule fois.</p>
    {error && <p role="alert" className="auth-message auth-message-error">{error}</p>}
    {members.length > 0 && <form className="login-form" onSubmit={submit}>
      <label><span>Votre profil</span><select required value={memberId} onChange={event => setMemberId(event.target.value)}><option value="">Choisir mon profil</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
      <label><span>Mot de passe de secours de l’équipe</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="login-submit" disabled={busy} type="submit">{busy ? 'ASSOCIATION…' : 'Associer mon compte'}</button>
    </form>}
    <button className="login-help" type="button" disabled={busy} onClick={onAnotherAccount}>Utiliser un autre compte Google</button>
    <button className="login-help" type="button" disabled={busy} onClick={onRescue}>Connexion de secours</button>
  </div>;
}
