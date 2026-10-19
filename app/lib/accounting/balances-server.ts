import { getSupabaseAdmin } from '../supabase/server';
import type { WorkspaceUser } from '../workspace';
import { AccountingError } from './model';
import { balanceAmount, balanceVersion, canEditBalance, type BrokerBalance } from './balances';

export async function listBrokerBalances(): Promise<BrokerBalance[]> {
  const {data,error}=await getSupabaseAdmin().rpc('accounting_list_broker_balances');
  if(error) throw error;
  return data;
}
export async function listBalanceHistory(broker:string|null, before:string|null) {
  if(!broker || !(await listBrokerBalances()).some(row=>row.broker===broker)) throw new AccountingError('Courtier introuvable.');
  if(before!==null && (!/^[1-9]\d*$/.test(before) || Number(before)>2147483647)) throw new AccountingError('Page d’historique invalide.');
  let query=getSupabaseAdmin().from('accounting_broker_balance_history')
    .select('id,old_balance,new_balance,updated_at,updated_by,version').eq('broker',broker)
    .order('version',{ascending:false}).limit(21);
  if(before!==null) query=query.lt('version',Number(before));
  const {data,error}=await query;
  if(error) throw error;
  const entries=(data??[]).slice(0,20);
  return {data:entries,nextCursor:(data?.length??0)>20?entries[19].version:null};
}
export async function setBrokerBalance(body: Record<string,unknown>, actor: WorkspaceUser) {
  const balance=balanceAmount(body.balance),version=balanceVersion(body.version);
  const rows=await listBrokerBalances();
  const broker=rows.find(b=>b.broker===body.broker);
  if(!broker) throw new AccountingError('Courtier introuvable.');
  if(!canEditBalance(actor,broker.broker)) throw new AccountingError('Un membre CRM autorisé et un courtier valide sont requis.',403);
  const {data,error}=await getSupabaseAdmin().rpc('accounting_set_broker_balance',{
    p_broker:broker.broker,p_balance:balance,p_actor:actor,p_expected_version:version,
  });
  if(error?.code==='40001' || (!error && !data?.length)) throw new AccountingError('Ce solde a été modifié entre-temps. Annulez puis actualisez le panneau avant de réessayer.',409);
  if(error) throw error;
  return {...data[0],label:broker.label} as BrokerBalance;
}
