'use client';
import { useEffect, useState, useCallback } from 'react';
import type { AssociationView } from './server';
export const associationChanged = () => window.dispatchEvent(new Event('listing-association-changed'));
function useRead<T>(url: string) {
    const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick(t => t + 1), []);
    useEffect(() => { const visible = () => { if (document.visibilityState === 'visible')
        refresh(); }; window.addEventListener('focus', refresh); window.addEventListener('listing-association-changed', refresh); document.addEventListener('visibilitychange', visible); return () => { window.removeEventListener('focus', refresh); window.removeEventListener('listing-association-changed', refresh); document.removeEventListener('visibilitychange', visible); }; }, [refresh]);
    useEffect(() => { const abort = new AbortController(); setLoading(true); setError(''); void fetch(url, { cache: 'no-store', signal: abort.signal }).then(async (r) => { const p = await r.json(); if (!r.ok)
        throw Error(p.error ?? 'Lecture indisponible.'); if (!abort.signal.aborted)
        setData(p.data); }).catch(e => { if (!abort.signal.aborted) {
        setData(null);
        setError(e instanceof Error ? e.message : 'Lecture indisponible.');
    } }).finally(() => { if (!abort.signal.aborted)
        setLoading(false); }); return () => abort.abort(); }, [url, tick]);
    return { data, error, loading, refresh };
}
export function useAssociationView(side: 'listing' | 'transaction', id: string, q = '') { return useRead<AssociationView>(`/api/listing-associations?side=${side}&id=${encodeURIComponent(id)}&q=${encodeURIComponent(q)}`); }
export function useAssociationSummary() { return useRead<{
    listings: string[];
    transactions: string[];
}>('/api/listing-associations?summary=1'); }
