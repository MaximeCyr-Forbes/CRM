'use client';
import { useEffect, useState } from 'react';
import type { CentrisStatus } from './centris-sync';
import './settings-centris.css';

const date = (value: string) => new Date(value).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' });

export function SettingsCentris() {
  const [status, setStatus] = useState<CentrisStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true, last = 0;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 2000) return;
      last = Date.now();
      try {
        const response = await fetch('/api/listings/centris/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Status unavailable');
        const body = await response.json();
        if (active) { setStatus(body.data); setError(false); }
      } catch { if (active) setError(true); }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  return <section className="settings-centris" aria-labelledby="settings-centris-title">
    <h2 id="settings-centris-title">CENTRIS — SYNCHRONISATION</h2>
    {error && <p role="status">État Centris temporairement indisponible.</p>}
    {!status ? !error && <p role="status">Vérification de la connexion Centris…</p> : <>
      <div className="settings-centris-status">
        <strong>{status.configured ? status.connected ? 'Centris connecté ✓' : 'Centris prêt à vérifier' : 'Centris non configuré'}</strong>
        <span>{status.automatic ? 'Synchronisation automatique aux 12 heures' : 'Synchronisation automatique inactive'}</span>
        <span>Dernière synchronisation réussie : {status.lastSuccessAt ? date(status.lastSuccessAt) : 'Aucune pour le moment'}</span>
      </div>
      <details className="settings-centris-history">
        <summary>Historique des synchronisations</summary>
        {status.history?.length ? <ol>{status.history.slice(0, 10).map((run, i) => <li key={`${run.startedAt}-${i}`}>
          <div><time dateTime={run.startedAt}>{date(run.startedAt)}</time><span>{run.source === 'cron' ? 'Automatique' : 'Manuelle'}</span>
            <span className={`settings-centris-badge ${run.status}`}>{run.status === 'success' ? 'Réussie' : run.status === 'partial' ? 'Partielle — à vérifier' : run.status === 'running' ? 'En cours' : 'Échouée — à réessayer'}</span></div>
          <p>{run.created} créés · {run.updated} modifiés · {run.unchanged} inchangés · {run.changes} changements détectés · {run.errors} erreurs</p>
        </li>)}</ol> : <p>Aucune synchronisation enregistrée.</p>}
      </details>
    </>}
  </section>;
}
