"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../auth-context';
type Connection = { id: string; name: string; grantedAt: string };
export default function OAuthConnectionsPage() {
 const { status, member } = useAuth();
 const [connections, setConnections] = useState<Connection[] | null>(null);
 const [error, setError] = useState('');
 const [busy, setBusy] = useState<string | null>(null);
 useEffect(() => {
  if (status === 'loading') return;
  if (!member) { window.location.replace('/login?returnTo=%2Foauth%2Fconnections'); return; }
  const controller = new AbortController();
  void fetch('/api/access/connections', { cache: 'no-store', signal: controller.signal })
   .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data.connections; })
   .then(setConnections).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Connexions indisponibles.'); });
  return () => controller.abort();
 }, [status, member]);
 async function revoke(id: string) {
  setBusy(id); setError('');
  try {
   const response = await fetch('/api/access/connections', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: id }) });
   const data = await response.json(); if (!response.ok) throw new Error(data.error);
   setConnections(current => current?.filter(connection => connection.id !== id) ?? []);
  } catch (err) { setError(err instanceof Error ? err.message : 'Révocation non confirmée.'); }
  finally { setBusy(null); }
 }
 return <main className="login-page"><section className="login-panel" aria-labelledby="connections-title">
  <header className="login-brand"><p>ÉQUIPE FORBES</p><h1 id="connections-title">Applications autorisées</h1></header>
  <p>Applications autorisées avec ce compte Google. Retirer un accès coupe ses prochaines demandes au CRM ; vos connexions Gmail, Agenda et Drive restent en place.</p>
  {error && <p role="alert">{error}</p>}
  {!connections && !error && <p role="status">Chargement…</p>}
  {connections?.length === 0 && <p>Aucune application autorisée avec ce compte.</p>}
  {connections?.map(connection => <div className="login-form" key={connection.id}><strong>{connection.name}</strong><p>Autorisée le {new Date(connection.grantedAt).toLocaleDateString('fr-CA')}</p><button type="button" disabled={busy !== null} onClick={() => void revoke(connection.id)}>{busy === connection.id ? 'Retrait…' : 'Retirer l’accès'}</button></div>)}
  <Link href="/">Retour au CRM</Link>
 </section></main>;
}
