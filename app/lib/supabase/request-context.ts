import {AsyncLocalStorage} from 'node:async_hooks';
import type {SupabaseClient} from '@supabase/supabase-js';
/** Server-only request isolation. Never fall back to admin within a scoped call. */
export const supabaseRequestContext = new AsyncLocalStorage<SupabaseClient>();
export function withSupabaseClient<T>(client:SupabaseClient, action:()=>Promise<T>) {
  return supabaseRequestContext.run(client,action);
}
