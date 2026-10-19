import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ index: 0, slots: [] as any[], deps: [] as any[], effects: [] as (() => void)[], cleanups: [] as (() => void)[], ready: true, status: 'authenticated' }));
vi.mock('./auth-context', () => ({ useAuth: () => ({ status: h.status }) }));
vi.mock('./broker-context', () => ({ useBroker: () => ({ selectedBroker: 'Maxime', isBrokerReady: h.ready }) }));
vi.mock('react', async original => {
  const react = await original<typeof import('react')>();
  const changed = (i: number, deps: any[]) => !h.deps[i] || deps.some((v, k) => !Object.is(v, h.deps[i][k]));
  const memo = (fn: () => any, deps: any[]) => { const i = h.index++; if (changed(i, deps)) { h.slots[i] = fn(); h.deps[i] = deps; } return h.slots[i]; };
  return { ...react, useState: (initial: any) => { const i = h.index++; if (!(i in h.slots)) h.slots[i] = initial; return [h.slots[i], (v: any) => { h.slots[i] = typeof v === 'function' ? v(h.slots[i]) : v; }]; },
    useRef: (initial: any) => { const i = h.index++; return h.slots[i] ??= { current: initial }; },
    useMemo: memo, useCallback: (fn: any, deps: any[]) => memo(() => fn, deps),
    useEffect: (fn: () => any, deps: any[]) => { const i = h.index++; if (changed(i, deps)) { h.effects.push(() => { h.cleanups[i]?.(); h.cleanups[i] = fn(); }); h.deps[i] = deps; } },
  };
});
import { CRMDataProvider } from './crm-data-context';
function render() { h.index = 0; const tree = CRMDataProvider({ children: null }); h.effects.splice(0).forEach(f => f()); return tree.props.value; }
function unmount() { h.cleanups.forEach(f => f?.()); h.index = 0; h.slots = []; h.deps = []; h.cleanups = []; }
const requests: { signal: AbortSignal; resolve: (v: unknown) => void; reject: (v: unknown) => void }[] = [];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const response = (id: string) => ({ ok: true, json: async () => ({ data: [{ id, first_name: id, broker: 'maxime' }] }) });
beforeEach(() => { h.index = 0; h.slots = []; h.deps = []; h.effects = []; h.cleanups = []; h.ready = true; h.status = 'authenticated'; requests.length = 0; vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.stubGlobal('fetch', vi.fn((url, init) => url.includes('resource=contacts') ? new Promise((resolve, reject) => requests.push({ signal: init.signal, resolve, reject })) : Promise.resolve({ ok: true }))); });
afterEach(() => { unmount(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('contact requests across broker context remounts', () => {
  it('waits for broker hydration before loading', () => { h.ready = false; render(); expect(requests).toHaveLength(0); h.ready = true; render(); expect(requests).toHaveLength(1); });
  it('finishes the initial load', async () => { render(); requests[0].resolve(response('initial')); await flush(); expect(render().contacts[0].id).toBe('initial'); expect(render().isLoading).toBe(false); });
  it('France → Maxime cancels the old load and ignores its late response', async () => { render(); const france = requests[0]; unmount(); render(); expect(france.signal.aborted).toBe(true); requests[1].resolve(response('maxime')); await flush(); france.resolve(response('france')); await flush(); expect(render().contacts[0].id).toBe('maxime'); expect(render().isLoading).toBe(false); });
  it('ten rapid switches only accept the final result', async () => { render(); for (let i = 0; i < 10; i++) { unmount(); render(); } requests.at(-1)!.resolve(response('final')); await flush(); for (const old of requests.slice(0, -1)) { expect(old.signal.aborted).toBe(true); old.resolve(response('stale')); } await flush(); expect(render().contacts[0].id).toBe('final'); });
  it('retry cancels a previous request without letting it clear loading', async () => { render(); const pending = render().retry(); requests[0].resolve(response('old')); await flush(); expect(render().isLoading).toBe(true); requests[1].resolve(response('new')); await pending; expect(render().contacts[0].id).toBe('new'); });
  it.each([401, 403, 500])('finishes with an error for HTTP %i and can retry', async status => { render(); requests[0].resolve({ ok: false, status }); await flush(); expect(render().isLoading).toBe(false); expect(render().error).toBeTruthy(); const retry = render().retry(); requests[1].resolve(response('recovered')); await retry; expect(render().error).toBeNull(); });
  it('finishes on network failure', async () => { render(); requests[0].reject(new Error('network')); await flush(); expect(render().isLoading).toBe(false); expect(render().error).toBeTruthy(); });
  it('bounds loading for an unresponsive network', async () => { render(); requests[0].signal.addEventListener('abort', () => requests[0].reject(requests[0].signal.reason)); await vi.advanceTimersByTimeAsync(20_000); expect(render().isLoading).toBe(false); expect(render().error).toBeTruthy(); });
});
