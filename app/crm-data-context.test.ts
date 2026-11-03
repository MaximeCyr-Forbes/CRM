import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ index: 0, slots: [] as any[], deps: [] as any[], effects: [] as (() => void)[], cleanups: [] as (() => void)[], ready: true, status: 'authenticated', path: '/contacts' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.path }));
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
const requests: { url: string; signal: AbortSignal; resolve: (v: unknown) => void; reject: (v: unknown) => void }[] = [];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const response = (id: string) => ({ ok: true, json: async () => ({ data: [{ id, first_name: id, broker: 'maxime' }] }) });
beforeEach(() => { h.index = 0; h.slots = []; h.deps = []; h.effects = []; h.cleanups = []; h.ready = true; h.status = 'authenticated'; h.path='/contacts'; vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', Object.assign(new EventTarget(), {visibilityState:'visible'})); requests.length = 0; vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.stubGlobal('fetch', vi.fn((url, init) => url.includes('resource=contacts') ? new Promise((resolve, reject) => requests.push({ url, signal: init.signal, resolve, reject })) : Promise.resolve({ ok: true }))); });
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


describe('external contact changes',()=>{
 const changed=(phone:string)=>({ok:true,json:async()=>({data:[{id:'qa',first_name:'QA',phone,email:`${phone}@example.test`,broker:'maxime'}]})});
 async function initial(){render();requests[0].resolve(changed('old'));await flush();render();}
 it('always reads current backend data after remount/F5, never trusts restored state',async()=>{
  await initial();expect(render().contacts[0].phone).toBe('old');unmount();render();expect(requests).toHaveLength(2);
  requests[1].resolve(changed('new'));await flush();expect(render().contacts[0].phone).toBe('new');
  expect(fetch).toHaveBeenCalledWith('/api/crm/data?resource=contacts',expect.objectContaining({cache:'no-store'}));
 });
 it('refetches only the visible contact on focus, without unmounting the editor',async()=>{
  h.path='/contacts/qa';await initial();window.dispatchEvent(new Event('focus'));
  expect(requests[1].url).toBe('/api/crm/data?resource=contacts&contactId=qa');expect(render().isLoading).toBe(false);
  requests[1].resolve(changed('new'));await flush();expect(render().contacts[0].phone).toBe('new');
 });
 it('coalesces focus and visibility events and does not poll for two minutes',async()=>{
  await initial();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
  expect(requests).toHaveLength(2);requests[1].resolve(changed('new'));await flush();document.dispatchEvent(new Event('visibilitychange'));expect(requests).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(120000);expect(requests).toHaveLength(2);
 });
 it('ignores hidden tabs, then revalidates the list and its counters when visible',async()=>{
  await initial();Object.assign(document,{visibilityState:'hidden'});window.dispatchEvent(new Event('focus'));expect(requests).toHaveLength(1);
  Object.assign(document,{visibilityState:'visible'});document.dispatchEvent(new Event('visibilitychange'));expect(requests[1].url).toBe('/api/crm/data?resource=contacts');
  requests[1].resolve({ok:true,json:async()=>({data:[{id:'qa',broker:'sandrine',email:'new@example.test',status:'inactive'}]})});await flush();expect(render().contacts[0]).toMatchObject({broker:'sandrine',email:'new@example.test',status:'inactive'});
 });
 it('keeps the last good data on network error and retries on the next focus',async()=>{
  await initial();window.dispatchEvent(new Event('focus'));requests[1].reject(new Error('offline'));await flush();expect(render().contacts[0].phone).toBe('old');expect(render().error).toBeNull();
  await vi.advanceTimersByTimeAsync(2000);window.dispatchEvent(new Event('focus'));requests[2].resolve(changed('new'));await flush();expect(render().contacts[0].phone).toBe('new');
 });
 it('revalidates on list → detail → list navigation, preserving other cached contacts',async()=>{
  await initial();h.path='/contacts/qa';render();expect(requests[1].url).toContain('contactId=qa');requests[1].resolve(changed('new'));await flush();
  h.path='/contacts';render();expect(requests[2].url).toBe('/api/crm/data?resource=contacts');
 });
 it('does not refresh contacts on unrelated modules and removes listeners on unmount',async()=>{
  h.path='/accounting';await initial();window.dispatchEvent(new Event('focus'));expect(requests).toHaveLength(1);unmount();window.dispatchEvent(new Event('focus'));expect(requests).toHaveLength(1);
 });
});

it('a route change supersedes an older background request',async()=>{
 render();requests[0].resolve(response('base'));await flush();h.path='/contacts/first';render();const older=requests[1];h.path='/contacts/second';render();expect(older.signal.aborted).toBe(true);
 requests[2].resolve(response('second'));await flush();older.resolve(response('first'));await flush();expect(render().contacts.map((c:any)=>c.id)).toEqual(['base','second']);
});
it('a late background response cannot overwrite a successful internal edit',async()=>{
 render();requests[0].resolve(response('qa'));await flush();window.dispatchEvent(new Event('focus'));
 vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({data:[{id:'qa',first_name:'QA',broker:'sandrine',phone:'internal'}]})} as Response);
 await render().assignContact('qa','sandrine');requests[1].resolve(response('qa'));await flush();expect(render().contacts[0]).toMatchObject({broker:'sandrine',phone:'internal'});
});
