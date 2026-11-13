import 'server-only';
export const API_BASE = 'https://datadistributionqc.centris.ca/v1/';
export const TOKEN_URL = 'https://accounts.centris.ca/connect/token';
export class CentrisError extends Error {
  constructor(public code: 'configuration' | 'auth' | 'unavailable' | 'invalid' | 'busy') {
    super(code === 'auth' ? 'Connexion Centris impossible.' : code === 'configuration'
      ? 'Centris non configuré.' : code === 'busy' ? 'Une synchronisation Centris est déjà en cours.'
      : 'Centris est temporairement indisponible. Réessayez.');
  }
}
export const odataString = (value: string) => `'${value.replaceAll("'", "''")}'`;
export const isConfigured = () => Boolean(process.env.CENTRIS_API_KEY?.trim()
  || (process.env.CENTRIS_CLIENT_ID?.trim() && process.env.CENTRIS_CLIENT_SECRET?.trim()));
type Options = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number };
export function createCentrisClient(options: Options = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  let cached: { token: string; expires: number } | undefined;
  let pending: Promise<string> | undefined;
  let nextRequestAt = 0;
  async function authorization(refresh = false): Promise<string> {
    const apiKey = process.env.CENTRIS_API_KEY?.trim();
    if (apiKey) return apiKey; // Official default auth; no OAuth credentials were issued.
    if (!isConfigured()) throw new CentrisError('configuration');
    if (!refresh && cached && cached.expires > now() + 60000) return cached.token;
    pending ??= (async () => {
      try {
        const response = await request(TOKEN_URL, { method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials',
            client_id: process.env.CENTRIS_CLIENT_ID!, client_secret: process.env.CENTRIS_CLIENT_SECRET! }),
          signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new CentrisError('auth');
        const data = await response.json();
        if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
          throw new CentrisError('auth');
        cached = { token: data.access_token, expires: now() + data.expires_in * 1000 };
        return cached.token;
      } catch { throw new CentrisError('auth'); }
    })();
    try { return await pending; } finally { pending = undefined; }
  }
  function safeUrl(input: string) {
    const url = new URL(input, API_BASE);
    if (url.origin !== new URL(API_BASE).origin || !url.pathname.startsWith('/v1/odata/')
      || url.username || url.password || url.hash) throw new CentrisError('invalid');
    return url;
  }
  async function get<T>(input: string, signal?: AbortSignal): Promise<T> {
    const url = safeUrl(input);
    let refreshed = false;
    let forceRefresh = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        signal?.throwIfAborted();
        const token = await authorization(forceRefresh);
        forceRefresh = false;
        // Official limit: 5 requests/second and 200/minute.
        const slot = Math.max(now(), nextRequestAt);
        nextRequestAt = slot + 310;
        if (slot > now()) await sleep(slot - now());
        const response = await request(url, { redirect: 'error', cache: 'no-store',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000) });
        if (response.status === 401 && !refreshed && !process.env.CENTRIS_API_KEY) { refreshed = true; forceRefresh = true; continue; }
        if (response.status === 401 || response.status === 403) throw new CentrisError('auth');
        if (response.status === 429 && attempt < 2) {
          const value = response.headers.get('Retry-After');
          const delay = value && /^\d+$/.test(value) ? Number(value) * 1000 : value ? Date.parse(value) - now() : 1000;
          if (!Number.isFinite(delay) || delay > 45000) throw new CentrisError('unavailable');
          await sleep(Math.max(250, delay)); continue;
        }
        if (response.status >= 500 && attempt < 2) { await sleep(500 * (attempt + 1)); continue; }
        if (!response.ok) throw new CentrisError('unavailable');
        return await response.json() as T;
      } catch (error) { throw error instanceof CentrisError ? error : new CentrisError('unavailable'); }
    }
    throw new CentrisError('unavailable');
  }
  async function collection<T>(resource: string, params: Record<string, string>, signal?: AbortSignal): Promise<T[]> {
    if (!/^[A-Za-z]+$/.test(resource)) throw new CentrisError('invalid');
    const result: T[] = []; const seen = new Set<string>();
    let next: string | null = `odata/${resource}?${new URLSearchParams(params)}`;
    for (let page = 0; next && page < 200; page++) {
      const canonical = safeUrl(next).href;
      if (seen.has(canonical)) throw new CentrisError('invalid');
      seen.add(canonical);
      const data: { value: T[]; '@odata.nextLink'?: string } = await get(canonical, signal);
      if (!Array.isArray(data.value)) throw new CentrisError('invalid');
      result.push(...data.value);
      if (result.length > 30000) throw new CentrisError('invalid');
      next = data['@odata.nextLink'] ?? null;
      // Centris explicitly omits nextLink when $top is supplied.
      if (!next && params.$top && data.value.length === Number(params.$top)) {
        next = `odata/${resource}?${new URLSearchParams({ ...params, $skip: String(Number(params.$skip ?? 0) + result.length) })}`;
      }
    }
    if (next) throw new CentrisError('invalid');
    return result;
  }
  return { get, collection };
}
export const centrisClient = createCentrisClient();
