import { crmMemberContext } from '../auth/context';
import { supabaseRequestContext } from '../supabase/request-context';
import { getSupabaseAdmin, getSupabaseServiceClient } from '../supabase/server';
import type { CalendarBroker } from '../../data/calendar-types';
/** Only the existing integration-token table uses service credentials after a member permission check. */
export function googleConnectionDatabase(broker: CalendarBroker) {
  const member = crmMemberContext.getStore();
  if (member) {
    if (!member.brokers.includes(broker)) throw new Error('Connexion Google inaccessible.');
    return getSupabaseServiceClient();
  }
  if (supabaseRequestContext.getStore()) throw new Error('Identité Google requise.');
  return getSupabaseAdmin(); // Existing legacy session / trusted scheduler.
}
export function listAuthorizedGoogleConnections() {
  const member = crmMemberContext.getStore();
  if (member) return getSupabaseServiceClient().from('google_calendar_connections').select('*').in('broker',member.brokers);
  if (supabaseRequestContext.getStore()) throw new Error('Identité Google requise.');
  return getSupabaseAdmin().from('google_calendar_connections').select('*');
}
