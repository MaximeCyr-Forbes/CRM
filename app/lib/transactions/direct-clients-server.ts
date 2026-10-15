import { getSupabaseAdmin } from "../supabase/server";
import { listAllSupabaseRows, type SupabaseOrderedRangeQuery } from "../supabase/pagination";
import type { WorkspaceUser } from "../workspace";
import { DirectClientError, directClientDuplicates, directClientId, normalizedDirectPhone, parseDirectClient, type DirectClient } from "./direct-clients";

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
  const original = rows.find(row => row.id === id);
  const sameCoordinates = original && (original.email ?? "").trim().toLowerCase() === (draft.email ?? "").trim().toLowerCase()
    && normalizedDirectPhone(original.phone) === normalizedDirectPhone(draft.phone);
  const duplicates = sameCoordinates ? [] : directClientDuplicates(rows, draft, id);
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

/** One SQL INSERT for the entire validated selection: no silent partial creation. */
export async function importDirectClients(transactionId: string, body: Record<string, unknown>, actor: WorkspaceUser) {
  if (!Array.isArray(body.clients) || body.clients.length < 1 || body.clients.length > 100) throw new DirectClientError("Sélectionnez entre 1 et 100 clients.");
  const candidates = await Promise.all(body.clients.map(async (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new DirectClientError("Ligne invalide.");
    const input = value as Record<string, unknown>;
    const importId = directClientId(input.importId);
    // Stable per-preview identities make retries safe, even after a lost response.
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${transactionId}:${importId}`)));
    digest[6]=(digest[6]&15)|80; digest[8]=(digest[8]&63)|128;
    const hex=Array.from(digest.slice(0,16),byte=>byte.toString(16).padStart(2,"0")).join("");
    const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    return { id, draft:parseDirectClient(input), allowDuplicate:input.allowDuplicate===true };
  }));
  if(new Set(candidates.map(c=>c.id)).size!==candidates.length)throw new DirectClientError("Ligne répétée dans la sélection.");
  const existing=await listDirectClients(transactionId);
  const sameDraft=(a:DirectClient,b:ReturnType<typeof parseDirectClient>)=>Object.keys(b).every(key=>a[key as keyof typeof b]===b[key as keyof typeof b]);
  const prior=candidates.map(c=>existing.find(row=>row.id===c.id));
  if(prior.every(Boolean)) {
    if(!prior.every((row,i)=>sameDraft(row!,candidates[i].draft)))throw new DirectClientError("Cet import a déjà été enregistré. Fermez l’aperçu et rechargez la liste.",409);
    return prior as DirectClient[];
  }
  if(prior.some(Boolean))throw new DirectClientError("Une partie de cette sélection existe déjà. Rechargez la liste avant de réessayer.",409);
  const seen=[...existing];
  for(const candidate of candidates){
    const duplicates=directClientDuplicates(seen,candidate.draft);
    if(duplicates.length&&!candidate.allowDuplicate)throw new DirectClientError("Un client est déjà présent. Vérifiez les doublons dans l’aperçu avant de réessayer.",409,duplicates);
    seen.push({...candidate.draft,id:candidate.id} as DirectClient);
  }
  const values=candidates.map(c=>({...c.draft,id:c.id,transaction_id:transactionId,created_by:actor,updated_by:actor}));
  const {data,error}=await getSupabaseAdmin().from("transaction_direct_clients").insert(values).select("*");
  if(error){
    // Concurrent retry of the exact same batch: verify the committed payload.
    if(error.code==='23505'){
      const rows=await listDirectClients(transactionId);
      const saved=candidates.map(c=>rows.find(row=>row.id===c.id&&sameDraft(row,c.draft)));
      if(saved.every(Boolean))return saved as DirectClient[];
    }
    throw error;
  }
  return data as DirectClient[];
}
