import { describe, expect, it } from 'vitest';
import { safeReturnPath, memberFromDatabase } from './identity';
import { crmMemberContext } from './context';
import { withSupabaseClient, supabaseRequestContext } from '../supabase/request-context';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('safe login redirect', () => {
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/\n/evil.example', '/login', '/api/access/google'])('rejects %s', value => {
    expect(safeReturnPath(value)).toBe('/');
  });
  it('retains the transaction and its query', () => expect(safeReturnPath('/transactions/qa?tab=clients')).toBe('/transactions/qa?tab=clients'));
});
describe('verified member', () => {
  it('does not derive membership from email or user metadata', () => {
    expect(memberFromDatabase({ email: 'maxime@equipeforbesteam.com', user_metadata: { role: 'admin' } })).toBeNull();
  });
  it('keeps the actor separate from the viewed broker', () => {
    const member=memberFromDatabase({member_id:'m',identity_id:'i',auth_user_id:'u',broker:'maxime',role:'admin',brokers:['maxime','france','sandrine']})!;
    crmMemberContext.run(member, () => {
      const viewedBroker='france';
      expect(viewedBroker).not.toBe(crmMemberContext.getStore()?.broker);
      expect(crmMemberContext.getStore()?.memberId).toBe('m');
    });
  });
  it('rejects an inconsistent permission set', () => {
    expect(memberFromDatabase({member_id:'m',identity_id:'i',auth_user_id:'u',broker:'france',role:'broker',brokers:['maxime']})).toBeNull();
  });
  it('isolates concurrent database and actor contexts', async () => {
    const first={} as SupabaseClient, second={} as SupabaseClient;
    let release!: () => void;
    const barrier=new Promise<void>(resolve => { release=resolve; });
    await Promise.all([
      withSupabaseClient(first, async () => { await barrier; expect(supabaseRequestContext.getStore()).toBe(first); }),
      withSupabaseClient(second, async () => { release(); await Promise.resolve(); expect(supabaseRequestContext.getStore()).toBe(second); }),
    ]);
    expect(supabaseRequestContext.getStore()).toBeUndefined();
    expect(crmMemberContext.getStore()).toBeUndefined();
  });
});
