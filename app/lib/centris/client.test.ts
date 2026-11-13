import { afterEach, expect, it, vi } from 'vitest';
import { createCentrisClient, TOKEN_URL } from './client';
afterEach(() => vi.unstubAllEnvs());
const json = (value: unknown, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers });
function client(request: ReturnType<typeof vi.fn>) {
  return createCentrisClient({ fetch: request as typeof fetch, sleep: async () => {}, now: () => 100000 });
}
it('uses API key without token exchange and follows bounded top/skip pagination', async () => {
  vi.stubEnv('CENTRIS_API_KEY', 'synthetic-key=');
  const request = vi.fn().mockResolvedValueOnce(json({ value: [1,2] })).mockResolvedValueOnce(json({ value: [3] }));
  expect(await client(request).collection('Member', { $top: '2' })).toEqual([1,2,3]);
  expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-key=');
  expect(String(request.mock.calls[1][0])).toContain('%24skip=2');
});
it('never forwards a key to an external nextLink', async () => {
  vi.stubEnv('CENTRIS_API_KEY', 'synthetic');
  const request = vi.fn().mockResolvedValue(json({ value: [1], '@odata.nextLink': 'https://example.com/steal' }));
  await expect(client(request).collection('Property', {})).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});
it('rejects repeated pagination and malformed collections', async () => {
  vi.stubEnv('CENTRIS_API_KEY', 'synthetic');
  const request = vi.fn().mockResolvedValue(json({ value: [], '@odata.nextLink': 'odata/Property?' }));
  await expect(client(request).collection('Property', {})).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
  await expect(client(vi.fn().mockResolvedValue(json({ error: 'private' }))).collection('Property', {})).rejects.toThrow();
});
it('refreshes OAuth exactly once on 401 and reuses refreshed token on retry', async () => {
  vi.stubEnv('CENTRIS_API_KEY', ''); vi.stubEnv('CENTRIS_CLIENT_ID', 'client'); vi.stubEnv('CENTRIS_CLIENT_SECRET', 'secret');
  const request = vi.fn().mockResolvedValueOnce(json({ access_token: 'first', expires_in: 3600 }))
    .mockResolvedValueOnce(json({},401)).mockResolvedValueOnce(json({ access_token: 'second', expires_in: 3600 }))
    .mockResolvedValueOnce(json({},500)).mockResolvedValueOnce(json({ value: [] }));
  await client(request).collection('Property', {});
  expect(request.mock.calls.filter(c => c[0] === TOKEN_URL)).toHaveLength(2);
  expect(request.mock.calls[4][1].headers.Authorization).toBe('Bearer second');
});
it('bounds rate limit retries and sanitizes errors', async () => {
  vi.stubEnv('CENTRIS_API_KEY', 'synthetic-secret');
  const request = vi.fn().mockResolvedValue(json({ secret: 'private' },429,{'Retry-After':'1'}));
  await expect(client(request).collection('Property', {})).rejects.toThrow('temporairement indisponible');
  expect(request).toHaveBeenCalledTimes(3);
  const denied = vi.fn().mockResolvedValue(json({},401));
  await expect(client(denied).collection('Property', {})).rejects.toThrow('Connexion');
  expect(denied).toHaveBeenCalledTimes(1);
});
