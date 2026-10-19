"use client";
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../auth-context';
export default function OAuthConsentPage() {
 const { status, member } = useAuth();
 const id = useSearchParams().get('authorization_id') ?? '';
 const [details,setDetails] = useState<{clientName:string;clientUri:string;broker:string;role:string}|null>(null);
 const [error,setError] = useState('');
 const [busy,setBusy] = useState(false);
 useEffect(()=>{
  if(status==='loading') return;
  if(!member) { window.location.replace(`/login?returnTo=${encodeURIComponent(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`)}`); return; }
  let active=true;
  void fetch(`/api/access/consent?authorization_id=${encodeURIComponent(id)}`,{cache:'no-store'})
   .then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error);return result;})
   .then(result=>{if(!active)return;if(result.redirect)window.location.assign(result.redirect);else setDetails(result);})
   .catch(err=>{if(active)setError(err instanceof Error?err.message:'Demande indisponible.');});
  return ()=>{active=false;};
 },[status,member,id]);
 async function decide(decision:'approve'|'deny') {
  setBusy(true);setError('');
  try {
   const response=await fetch('/api/access/consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorization_id:id,decision})});
   const result=await response.json();if(!response.ok)throw new Error(result.error);
   window.location.assign(result.redirect);
  }catch(err){setError(err instanceof Error?err.message:'Demande indisponible.');setBusy(false);}
 }
 return <main className="login-page"><section className="login-panel" aria-labelledby="consent-title">
  <header className="login-brand"><p>ÉQUIPE FORBES</p><h1 id="consent-title">Connexion CRM</h1></header>
  {error && <p className="auth-message auth-message-error" role="alert">{error}</p>}
  {!details && !error && <p role="status">Vérification de votre connexion…</p>}
  {details && <div className="login-form"><p><strong>{details.clientName}</strong> demande l’accès au CRM sous votre identité <strong>{details.broker}</strong>.</p>
   <p>Cette application pourra consulter et modifier les dossiers autorisés par vos permissions. Elle ne recevra aucun jeton Gmail, Google Agenda ou Drive.</p>
   <p>Application : {details.clientUri}</p>
   <button className="login-submit" disabled={busy} type="button" onClick={()=>void decide('approve')}>{busy?'CONNEXION…':'Autoriser cette application'}</button>
   <button disabled={busy} type="button" onClick={()=>void decide('deny')}>Refuser</button>
  </div>}
 </section></main>;
}
