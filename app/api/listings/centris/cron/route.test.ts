import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const sync = vi.hoisted(() => vi.fn());
vi.mock('../../../../lib/centris/sync', () => ({ syncCentris: sync }));
import { POST } from './route';
import { CentrisError } from '../../../../lib/centris/client';
const secret = 'synthetic-only-test-secret';
beforeEach(() => { vi.stubEnv('CENTRIS_CRON_SECRET', secret); sync.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
const request = (authorization?: string, body = '{}') => new Request('https://example.test/api/listings/centris/cron', {
 method: 'POST', headers: authorization ? { authorization } : {}, body,
});
it.each([undefined, 'Bearer wrong', 'Basic test', 'Bearer', 'Bearer a b'])(
 'rejects invalid credentials %s without running sync', async token => {
  expect((await POST(request(token))).status).toBe(401); expect(sync).not.toHaveBeenCalled();
 });
it.each(['', '   '])('fails closed without configured secret', async value => {
 vi.stubEnv('CENTRIS_CRON_SECRET', value);
 expect((await POST(request(`Bearer ${secret}`))).status).toBe(503); expect(sync).not.toHaveBeenCalled();
});
it('uses the null system actor and real mode regardless of supplied overrides', async () => {
 sync.mockResolvedValue({ fetched: 25, created: 0, errors: 0, preview: [{ address: 'private' }], warnings: [] });
 const response = await POST(request(`Bearer ${secret}`, JSON.stringify({ dryRun: true, broker: 'maxime', filter: 'all' })));
 expect(response.status).toBe(200);
 expect(sync).toHaveBeenCalledExactlyOnceWith({ memberId: null, broker: null, source: 'cron' }, false);
 expect(await response.json()).toEqual({ status: 'success', fetched: 25, created: 0, errors: 0 });
});
it('returns a benign response when the shared lock is held', async () => {
 sync.mockRejectedValue(new CentrisError('busy'));
 const response = await POST(request(`Bearer ${secret}`));
 expect(response.status).toBe(202); expect(await response.json()).toEqual({ status: 'already_running' });
});
it('sanitizes failures and never echoes credentials', async () => {
 sync.mockRejectedValue(new Error(secret));
 const response = await POST(request(`Bearer ${secret}`));
 expect(response.status).toBe(503); expect(await response.text()).not.toContain(secret);
});
