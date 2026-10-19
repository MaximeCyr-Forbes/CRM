import { isWorkingBroker, type WorkingBroker } from '../workspace';
export type CRMMember = {
  memberId: string; identityId: string; authUserId: string;
  broker: WorkingBroker; role: 'admin' | 'broker'; brokers: WorkingBroker[];
};
/** Parse only the authenticated database resolver, never user metadata. */
export function memberFromDatabase(value: unknown): CRMMember | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.member_id !== 'string' || typeof row.identity_id !== 'string'
    || typeof row.auth_user_id !== 'string' || !isWorkingBroker(row.broker)
    || (row.role !== 'admin' && row.role !== 'broker')
    || !Array.isArray(row.brokers) || !row.brokers.every(isWorkingBroker)
    || !row.brokers.includes(row.broker)) return null;
  return { memberId: row.member_id, identityId: row.identity_id, authUserId: row.auth_user_id,
    broker: row.broker, role: row.role, brokers: row.brokers };
}
export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://crm.invalid');
    if (url.origin !== 'https://crm.invalid' || url.pathname === '/login'
      || url.pathname.startsWith('/api/access/')) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
