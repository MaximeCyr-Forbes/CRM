import { getSupabaseAdmin } from "../supabase/server";
import { AccountingError, monthlyIntent, expenseFields, invoiceFields, matchesSignature, validId, type Expense } from "./model";
import type { WorkspaceUser } from "../workspace";

export const INVOICE_BUCKET = "accounting-invoices";
type Document = { id: string; expense_id: string | null; storage_path: string; file_name: string; mime_type: string; size: number; state: "pending" | "current" | "retired"; upload_expires_at: string; uploaded_at: string };
const columns = "id,recurring_rule_id,recurring_period,recurring_rule:accounting_recurring_expenses(active,day_of_month,next_due_date),category,expense_date,vendor,description,amount,notes,is_paid,paid_at,renewal_date,created_by,updated_by,created_at,updated_at,accounting_expense_documents(id,file_name,mime_type,size,uploaded_at,state)";
function checked<T>(result: { data: T | null; error: unknown }): T { if (result.error) throw result.error; return result.data as T; }
function view(row: Record<string, unknown>): Expense {
  const { accounting_expense_documents, ...fields } = row;
  const invoice = (accounting_expense_documents as Document[] ?? []).find(d => d.state === "current");
  return { ...fields, amount: fields.amount == null ? null : Number(fields.amount), invoice: invoice ? { id: invoice.id, file_name: invoice.file_name, mime_type: invoice.mime_type, size: invoice.size, uploaded_at: invoice.uploaded_at } : null } as Expense;
}
export async function getExpense(id: string) {
  const row = checked(await getSupabaseAdmin().from("accounting_expenses").select(columns).eq("id", validId(id)).maybeSingle());
  if (!row) throw new AccountingError("Dépense introuvable.",404);
  return view(row);
}
export async function listExpenses() {
  checked(await getSupabaseAdmin().rpc("accounting_materialize_recurring_expenses",{}));
  const rows: Expense[] = [];
  for (let offset=0; ; offset+=500) {
    const page = checked(await getSupabaseAdmin().from("accounting_expenses").select(columns).order("expense_date",{ascending:false}).order("created_at",{ascending:false}).order("id").range(offset,offset+499));
    rows.push(...page.map(view));
    if (page.length<500) return rows;
  }
}
function requireInvoiceIntent(body: unknown, hasInvoice=false) {
  const input=body as Record<string,unknown>;
  if(hasInvoice || input?.save_without_invoice === true)return;
  if(input?.invoice && typeof input.invoice === "object") {invoiceFields(input.invoice as Parameters<typeof invoiceFields>[0]);return;}
  throw new AccountingError("Confirmez l’enregistrement sans facture.",409);
}
export async function createExpense(body: unknown, actor: WorkspaceUser) {
  const fields=expenseFields(body);
  requireInvoiceIntent(body);
  const monthly=monthlyIntent(body as Record<string,unknown>,fields.expense_date);
  if(monthly) {
    const id=checked(await getSupabaseAdmin().rpc("accounting_save_recurring_expense",{p_expense:null,p_fields:fields,p_monthly:true,p_stop_confirmed:false,p_actor:actor,p_token:null}));
    return getExpense(id);
  }
  return view(checked(await getSupabaseAdmin().from("accounting_expenses").insert({ ...fields, created_by: actor, updated_by: actor }).select(columns).single()));
}
// Cross-instance lease: do not let simultaneous invoice replacement/deletion lose paths.
async function locked<T>(id: string, action: (token: string) => Promise<T>) {
  validId(id);
  const db=getSupabaseAdmin(), token=crypto.randomUUID();
  const row=checked(await db.from("accounting_expenses").update({operation_token:token,operation_until:new Date(Date.now()+180_000).toISOString()}).eq("id",id)
    .or(`operation_until.is.null,operation_until.lt.${new Date().toISOString()}`).select("id").maybeSingle());
  if (!row) throw new AccountingError("Dépense indisponible ou modification en cours. Réessayez.",409);
  try { return await action(token); }
  finally { const {error}=await db.from("accounting_expenses").update({operation_token:null,operation_until:null}).eq("id",id).eq("operation_token",token); if(error) console.error("Accounting lease release failed"); }
}
async function documents(id: string) { return checked(await getSupabaseAdmin().from("accounting_expense_documents").select("*").eq("expense_id",id)) as Document[]; }
async function removeObject(doc: Document) {
  const db=getSupabaseAdmin();
  const result=await db.storage.from(INVOICE_BUCKET).remove([doc.storage_path]);
  if(result.error) throw new AccountingError("Nettoyage de la facture impossible. Réessayez : la trace du fichier est conservée.",502);
  // A signed upload can still be used until expiry; keep its tombstone meanwhile.
  checked(await db.from("accounting_expense_documents").update({state:"retired"}).eq("id",doc.id));
  if(new Date(doc.upload_expires_at).getTime()<Date.now()) checked(await db.from("accounting_expense_documents").delete().eq("id",doc.id));
}
export async function cleanupInvoices() {
  const expired=checked(await getSupabaseAdmin().from("accounting_expense_documents").select("*").neq("state","current").lt("upload_expires_at",new Date().toISOString()).limit(25)) as Document[];
  for(const doc of expired) await removeObject(doc);
}
async function cleanupRetired(id: string) { for(const doc of await documents(id)) if(doc.state==="retired") await removeObject(doc); }
export async function setExpensePayment(id: string, isPaid: unknown, actor: WorkspaceUser) {
  if (typeof isPaid !== "boolean") throw new AccountingError("Statut de paiement invalide.");
  return locked(id, async token => {
    const row = await getExpense(id);
    if (row.is_paid === isPaid) return row;
    return view(checked(await getSupabaseAdmin().from("accounting_expenses").update({is_paid:isPaid,paid_at:isPaid ? new Date().toISOString() : null,updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id).eq("operation_token",token).select(columns).single()));
  });
}
export async function updateExpense(id: string, body: unknown, actor: WorkspaceUser) {
  const fields=expenseFields(body);
  const monthly=monthlyIntent(body as Record<string,unknown>,fields.expense_date);
  return locked(id,async token=> {
    requireInvoiceIntent(body,(await documents(id)).some(d=>d.state==="current"));
    await cleanupRetired(id);
    const current=await getExpense(id), stopped=(body as Record<string,unknown>).confirm_stop === true;
    if(current.recurring_rule?.active && monthly===false && !stopped) throw new AccountingError("Confirmez l’arrêt de la récurrence.",409);
    if((monthly ?? current.recurring_rule?.active) && !fields.expense_date) throw new AccountingError("Choisissez la date de la première occurrence pour activer la récurrence mensuelle.");
    if(current.recurring_rule_id || monthly) {
      checked(await getSupabaseAdmin().rpc("accounting_save_recurring_expense",{p_expense:id,p_fields:fields,p_monthly:monthly,p_stop_confirmed:stopped,p_actor:actor,p_token:token}));
      return getExpense(id);
    }
    return view(checked(await getSupabaseAdmin().from("accounting_expenses").update({...fields,updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id).eq("operation_token",token).select(columns).single()));
  });
}
export async function deleteExpense(id: string) {
  return locked(id,async token=> {
    for(const doc of await documents(id)) await removeObject(doc);
    checked(await getSupabaseAdmin().from("accounting_expenses").delete().eq("id",id).eq("operation_token",token));
  });
}
export async function prepareInvoice(id: string, body: { name: unknown; type: unknown; size: unknown }) {
  const fields=invoiceFields(body);
  return locked(id,async()=> {
    await cleanupRetired(id);
    const existing=await documents(id);
    if(existing.filter(d=>d.state==="pending").length>=5) throw new AccountingError("Trop d’envois en attente. Retirez la facture en attente ou réessayez après leur expiration.",409);
    const db=getSupabaseAdmin(), documentId=crypto.randomUUID();
    const path=`${id}/${documentId}.${fields.extension}`;
    checked(await db.from("accounting_expense_documents").insert({id:documentId,expense_id:id,storage_path:path,file_name:fields.file_name,mime_type:fields.mime_type,size:fields.size}));
    const result=await db.storage.from(INVOICE_BUCKET).createSignedUploadUrl(path, {upsert:false});
    if(result.error) { checked(await db.from("accounting_expense_documents").delete().eq("id",documentId)); throw result.error; }
    return {documentId,signedUrl:result.data.signedUrl};
  });
}
export async function completeInvoice(id: string, documentId: string, actor: WorkspaceUser) {
  validId(documentId);
  return locked(id,async token=> {
    const db=getSupabaseAdmin();
    const doc=(await documents(id)).find(d=>d.id===documentId);
    if(!doc || doc.state==="retired") throw new AccountingError("Envoi de facture introuvable ou expiré.",409);
    if(doc.state==="current") { await cleanupRetired(id); return getExpense(id); }
    if(new Date(doc.upload_expires_at).getTime()<=Date.now()) { await removeObject(doc); throw new AccountingError("Envoi expiré : sélectionnez à nouveau la facture.",409); }
    const {data:blob,error}=await db.storage.from(INVOICE_BUCKET).download(doc.storage_path);
    if(error || !blob) throw new AccountingError("Facture non reçue. La dépense est conservée ; réessayez l’envoi.",502);
    if(blob.size!==doc.size || blob.type.split(";")[0]!==doc.mime_type || !matchesSignature(new Uint8Array(await blob.slice(0,16).arrayBuffer()),doc.mime_type)) {
      await removeObject(doc); throw new AccountingError("Le contenu de la facture ne correspond pas au format ou à la taille annoncés.");
    }
    checked(await db.rpc("accounting_promote_invoice", {p_expense:id,p_document:documentId,p_token:token,p_actor:actor}));
    await cleanupRetired(id);
    return getExpense(id);
  });
}
export async function deleteInvoice(id: string, actor: WorkspaceUser) {
  return locked(id,async()=> {
    for(const doc of await documents(id)) await removeObject(doc);
    checked(await getSupabaseAdmin().from("accounting_expenses").update({updated_by:actor,updated_at:new Date().toISOString()}).eq("id",id));
    return getExpense(id);
  });
}
export async function openInvoice(id: string) {
  await getExpense(id);
  const doc=(await documents(id)).find(d=>d.state==="current");
  if(!doc) throw new AccountingError("Aucune facture enregistrée.",404);
  const result=checked(await getSupabaseAdmin().storage.from(INVOICE_BUCKET).createSignedUrl(doc.storage_path,60));
  return result.signedUrl;
}
