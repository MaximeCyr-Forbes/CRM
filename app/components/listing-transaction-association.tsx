'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { associationChanged, useAssociationView } from '../lib/listing-associations/use-associations';
import { strongMatch, type Association, type Entity, type Match } from '../lib/listing-associations/matching';
import { LISTING_STATUS_LABELS, type ListingStatus } from '../data/listing-types';
import { TRANSACTION_STATUS_LABELS, type TransactionStatus } from '../data/transaction-types';
import './listing-transaction-association.css';
const money = (n: number | null) => n === null ? 'Non renseigné' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
function RecordCard({ entity, side }: {
    entity: Entity;
    side: 'listing' | 'transaction';
}) { return <article className="association-record"><strong>{side === 'listing' ? 'Listing' : 'Transaction'}</strong><p>{entity.address}</p><dl><div><dt>Centris</dt><dd>{entity.centris || 'Non renseigné'}</dd></div><div><dt>Courtier</dt><dd>{entity.broker}</dd></div><div><dt>Type</dt><dd>{entity.type === 'sale' ? 'Vente' : entity.type === 'purchase' ? 'Achat' : 'Location'}</dd></div><div><dt>Statut</dt><dd>{side === 'listing' ? LISTING_STATUS_LABELS[entity.status as ListingStatus] : TRANSACTION_STATUS_LABELS[entity.status as TransactionStatus]}</dd></div><div><dt>{side === 'listing' ? 'Prix demandé' : 'Montant enregistré'}</dt><dd>{money(entity.price)}</dd></div></dl></article>; }
type Selection = {
    entity: Entity;
    match?: Match;
    link?: Association;
};
export function ListingTransactionAssociation({ side, id }: {
    side: 'listing' | 'transaction';
    id: string;
}) {
    const router = useRouter(), [search, setSearch] = useState(''), [query, setQuery] = useState(''), [manual, setManual] = useState(false), [selection, setSelection] = useState<Selection | null>(null), [ack, setAck] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const { data, error: readError, loading, refresh } = useAssociationView(side, id, query), dialog = useRef<HTMLDialogElement>(null), inFlight = useRef(false);
    useEffect(() => { if (selection)
        dialog.current?.showModal();
    else
        dialog.current?.close(); }, [selection]);
    const other = side === 'listing' ? 'transaction' : 'listing';
    function choose(s: Selection) { setError(''); setAck(false); setSelection(s); }
    function close() { if (!inFlight.current)
        setSelection(null); }
    async function confirm() {
        if (!selection || !data || inFlight.current)
            return;
        inFlight.current = true;
        setBusy(true);
        setError('');
        const l = side === 'listing' ? data.own : selection.entity, t = side === 'transaction' ? data.own : selection.entity;
        try {
            const r = await fetch('/api/listing-associations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId: l.id, transactionId: t.id, listingVersion: l.updatedAt, transactionVersion: t.updatedAt, kind: t.status === 'cancelled' ? 'historical' : 'primary', confirmed: true, conflictAcknowledged: ack, ...(selection.link ? { detachId: selection.link.id, version: selection.link.version } : {}) }) });
            const p = await r.json();
            if (!r.ok)
                throw Error(p.error ?? 'Rattachement impossible.');
            setSelection(null);
            associationChanged();
            refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Rattachement impossible.');
        }
        finally {
            inFlight.current = false;
            setBusy(false);
        }
    }
    const open = (e: Entity) => router.push(`/${other === 'listing' ? 'listings' : 'transactions'}/${e.id}`);
    const active = data?.linked.filter(l => !l.detachedAt) ?? [], past = data?.linked.filter(l => l.detachedAt) ?? [];
    const candidates = (manual || !active.some(l => l.kind === 'primary' && (side === 'listing' ? l.entity.status : data?.own.status) !== 'cancelled')) ? (data?.candidates ?? []) : [], current = candidates.filter(c => !c.match.historical), historic = candidates.filter(c => c.match.historical);
    const renderCandidate = (c: typeof candidates[number]) => <article key={c.entity.id} className="association-candidate"><RecordCard side={other} entity={c.entity}/><p className={c.match.kind === 'CONFLICT' ? 'association-warning' : ''}>{c.match.reasons.join(' · ') || 'Choix manuel — vérifiez les deux fiches.'}</p><div className="association-actions"><button type="button" onClick={() => open(c.entity)}>Voir {other === 'listing' ? 'le Listing' : 'la Transaction'}</button><button type="button" disabled={c.match.blocked} onClick={() => choose(c)}>Rattacher{c.match.historical ? ' à l’historique' : ''}</button></div></article>;
    return <section className="association-section" id="association" aria-label={side === 'listing' ? 'Transaction associée' : 'Listing associé'}><div className="association-heading"><h2>{side === 'listing' ? 'TRANSACTION ASSOCIÉE' : 'LISTING ASSOCIÉ'}</h2><button type="button" onClick={() => setManual(m => !m)}>{manual ? 'Masquer la recherche' : side === 'listing' ? 'Choisir une autre Transaction' : 'Rechercher un autre Listing'}</button></div>
  {readError && <p role="alert">{readError} <button onClick={refresh} type="button">Réessayer</button></p>}{loading && !data && <p role="status">Recherche des correspondances…</p>}
  {active.map(l => <article className="association-linked" key={`${l.source}-${l.id}`}><strong>{l.kind === 'historical' || (side === 'listing' ? l.entity.status : data?.own.status) === 'cancelled' ? 'Association historique' : side === 'listing' ? 'TRANSACTION LIÉE' : 'LISTING LIÉ'}</strong><p>{l.entity.address} · {l.entity.status} · {l.entity.broker}</p><small>{l.source === 'accepted_offer' ? 'Provenance : offre acceptée (workflow existant).' : `Association documentaire · ${l.createdBy} · ${new Date(l.createdAt).toLocaleDateString('fr-CA')}`}</small><div className="association-actions"><button type="button" onClick={() => open(l.entity)}>Ouvrir {other === 'listing' ? 'le Listing' : 'la Transaction'}</button>{l.source === 'documentary' && <button type="button" onClick={() => choose({ entity: l.entity, link: l })}>Détacher {other === 'listing' ? 'le Listing' : 'la Transaction'}</button>}</div></article>)}
  {manual && <form className="association-search" onSubmit={e => { e.preventDefault(); setQuery(search.trim()); }}><label>Rechercher {other === 'listing' ? 'un Listing' : 'une Transaction'}<input value={search} onChange={e => setSearch(e.target.value)} maxLength={160} placeholder="Numéro Centris, adresse ou ville"/></label><button type="submit">Rechercher</button></form>}
  {!readError && data && current.length > 0 && <><h3>{query ? 'Résultats de recherche' : current.some(c => strongMatch(c.match)) ? 'Correspondance recommandée' : 'Correspondances à vérifier'}</h3>{!query && <p>{side === 'listing' ? 'Transaction existante détectée' : 'Listing existant détecté'} — à vérifier avant confirmation.</p>}{current.map(renderCandidate)}</>}
  {!readError && data && !candidates.length && !active.length && <p>Aucune correspondance proposée. Utilisez la recherche pour rattacher {other === 'listing' ? 'un Listing existant' : 'une Transaction existante'}.</p>}
  {historic.length > 0 && <details><summary>Correspondances historiques ({historic.length})</summary>{historic.map(renderCandidate)}</details>}
  {data?.truncated && <p>20 résultats affichés. Précisez la recherche.</p>}
  {past.length > 0 && <details><summary>Historique des détachements ({past.length})</summary>{past.map(l => <p key={l.id}>{l.entity.address} · rattaché par {l.createdBy} le {new Date(l.createdAt).toLocaleString('fr-CA')} · détaché par {l.detachedBy} le {new Date(l.detachedAt!).toLocaleString('fr-CA')} · version {l.version}</p>)}</details>}
  <dialog ref={dialog} className="association-dialog" aria-labelledby={`association-title-${side}`} onCancel={e => { e.preventDefault(); close(); }}>{selection && data && <><h2 id={`association-title-${side}`}>{selection.link ? 'Détacher le dossier' : side === 'listing' ? 'Rattacher une Transaction' : 'Rattacher un Listing'}</h2><div className="association-comparison"><RecordCard entity={side === 'listing' ? data.own : selection.entity} side="listing"/><RecordCard entity={side === 'transaction' ? data.own : selection.entity} side="transaction"/></div><p>Le prix demandé et le montant de la Transaction sont des champs différents. Ils restent inchangés, comme les statuts et les documents.</p><p>{selection.link ? 'Seul le lien documentaire sera détaché. Sa trace sera conservée.' : 'Cette association ne crée ni offre ni nouvelle Transaction et ne constitue pas une PA acceptée.'}</p>{selection.match && <p>{selection.match.reasons.join(' · ')}</p>}{selection.match?.kind === 'CONFLICT' && <label className="association-ack"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}/>J’ai vérifié les différences et confirme qu’il s’agit des dossiers à associer.</label>}{error && <p role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={close}>Annuler</button><button type="button" disabled={busy || (selection.match?.kind === 'CONFLICT' && !ack)} onClick={() => void confirm()}>{busy ? 'Enregistrement…' : selection.link ? 'Confirmer le détachement' : 'Confirmer le rattachement'}</button></footer></>}</dialog>
 </section>;
}
