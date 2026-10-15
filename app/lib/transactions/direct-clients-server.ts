import { getSupabaseAdmin } from "../supabase/server";
import { listAllSupabaseRows, type SupabaseOrderedRangeQuery } from "../supabase/pagination";
import type { WorkspaceUser } from "../workspace";
import { DirectClientError, directClientDuplicates, directClientId, parseDirectClient, type DirectClient } from "./direct-clients";

async function transactionExists(transactionId: string) {
  const { data, error } = await getSupabaseAdmin().from("transactions").select("id").eq("id", directClientId(transactionId)).maybeSingle();
  if (error) throw error;
  if (!data) throw new DirectClientError("Transaction introuvable.", 404);
}
export async function listDirectClients(transactionId: string): Promise<DirectClient[]> {
  await transactionExists(transactionId);
  return listAllSupabaseRows<DirectClient>({ buildQuery: () => getSupabaseAdmin().from("transaction_direct_clients").select("*")
    .eq("transaction_id", transactionId) as unknown as SupabaseOrderedRangeQuery<DirectClient>, orders: [{ column: "created_at", ascending: false }, { column: "id", ascending: true }] });
}
export async function saveDirectClient(transactionId: string, body: Record<string, unknown>, actor: WorkspaceUser, edit = false) {
  const draft = parseDirectClient(body);
  const id = edit ? directClientId(body.id) : undefined;
  const rows = await listDirectClients(transactionId);
  if (edit && !rows.some(row => row.id === id)) throw new DirectClientError("Client introuvable dans cette transaction.", 404);
  const duplicates = directClientDuplicates(rows, draft, id);
  if (duplicates.length && body.allowDuplicate !== true) throw new DirectClientError("Ce client semble déjà être dans la liste.", 409, duplicates);
  const db = getSupabaseAdmin();
  const query = edit
    ? db.from("transaction_direct_clients").update({ ...draft, updated_by: actor, updated_at: new Date().toISOString() }).eq("transaction_id", transactionId).eq("id", id!)
    : db.from("transaction_direct_clients").insert({ ...draft, transaction_id: transactionId, created_by: actor, updated_by: actor });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as DirectClient;
}
export async function deleteDirectClient(transactionId: string, id: unknown) {
  await transactionExists(transactionId);
  const { data, error } = await getSupabaseAdmin().from("transaction_direct_clients").delete()
    .eq("transaction_id", transactionId).eq("id", directClientId(id)).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new DirectClientError("Client introuvable dans cette transaction.", 404);
}

