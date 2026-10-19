import { supabaseRequestContext } from "./request-context";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverClient: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  const scoped = supabaseRequestContext.getStore();
  if (scoped) return scoped;
  return getSupabaseServiceClient();
}

/** Server-only infrastructure credentials; business queries must use getSupabaseAdmin under the request scope. */
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error("Configuration Supabase serveur incomplète.");
  serverClient ??= createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  return serverClient;
}
