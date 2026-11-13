'use client';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { SyncResult } from '../lib/centris/sync';
type Status = { configured: boolean; connected: boolean; running?: boolean; lastSuccessAt?: string; lastRunAt?: string };
export function CentrisSync({ onSynced }: { onSynced: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null), [error, setError] = useState('');
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, [open]);
  async function refreshStatus() {
    try { const response = await fetch('/api/listings/centris/status', { cache: 'no-store' });
      if (response.ok) setStatus((await response.json()).data); } catch { /* Existing Listings remain usable. */ }
  }
  useEffect(() => { void refreshStatus(); }, []);
  async function run(dryRun: boolean) {
    if (busy) return; setBusy(true); setError('');
    try {
      const response = await fetch('/api/listings/centris/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Synchronisation indisponible.');
      setResult(body.data); if (!dryRun) { onSynced(); await refreshStatus(); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Synchronisation indisponible.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="centris-sync-control">
      <button type="button" className="centris-sync-button" disabled={!status?.configured || busy || status.running}
        onClick={() => { setOpen(true); setResult(null); void run(true); }}><RefreshCw size={15} /> Synchroniser Centris</button>
      <small>{status === null ? 'État Centris en cours de vérification' : status.configured ? status.connected ? 'Centris connecté ✓' : 'Centris prêt à vérifier' : 'Centris non configuré'}
        {status?.lastRunAt && <> · Dernière synchro : {new Date(status.lastRunAt).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' })}</>}</small>
    </div>
    {open && <div className="centris-sync-overlay"><section ref={dialog} tabIndex={-1} className="centris-sync-dialog" role="dialog" aria-modal="true" aria-labelledby="centris-sync-title"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) setOpen(false);
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary') ?? []);
        if (!controls.length) { event.preventDefault(); return; }
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
      <button type="button" className="centris-sync-close" aria-label="Fermer la synchronisation Centris" disabled={busy} onClick={() => setOpen(false)}><X size={18} /></button>
      <h2 id="centris-sync-title">Synchronisation Centris</h2>
      <p>Les données Centris sont actualisées. Vos notes, offres, propriétaires et suivis sont conservés.</p>
      {busy && <p role="status">{result?.dryRun ? 'Synchronisation…' : 'Vérification Centris…'}</p>}
      {error && <p role="alert">{error}</p>}
      {result && <>
        <p role="status"><strong>{result.dryRun ? 'Aperçu — aucune donnée modifiée' : result.errors ? 'Synchronisation partielle — certains éléments sont à réessayer' : 'Synchronisation terminée ✓'}</strong></p>
        <p>{result.created} {result.dryRun ? 'à créer' : 'créés'} · {result.updated} {result.dryRun ? 'à mettre à jour' : 'mis à jour'} · {result.unchanged} inchangés</p>
        {result.skipped > 0 && <p>{result.skipped} hors import ou conservés.</p>}
        {(result.conflicts > 0 || result.errors > 0 || result.warnings.length > 0) && <details><summary>Éléments à vérifier ({result.conflicts + result.errors + result.warnings.length})</summary>
          {result.conflicts > 0 && <p>Identité Centris en conflit : import bloqué.</p>}{result.warnings.map((w, i) => <p key={i}>{w}</p>)}</details>}
        {result.dryRun && <details><summary>Voir les propriétés</summary><ul>{result.preview.map((p, i) => <li key={i}>{p.address} · {p.broker} · {p.price?.toLocaleString('fr-CA')} $ · {p.action === 'skipped' ? 'Hors import' : p.action === 'created' ? 'Nouveau' : 'Existant'}</li>)}</ul></details>}
        {result.dryRun && <button type="button" className="listing-new" disabled={busy || result.conflicts > 0} onClick={() => void run(false)}>Confirmer la synchronisation</button>}
      </>}
      {!busy && error && <button type="button" className="centris-sync-button" onClick={() => void run(true)}>Réessayer la vérification</button>}
    </section></div>}
  </>;
}
