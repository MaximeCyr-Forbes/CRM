import { getSupabaseAdmin } from '../supabase/server';
import type { WorkspaceUser } from '../workspace';
import { AccountingError } from './model';
import { balanceAmount, balanceVersion, canEditBalance, type BrokerBalance } from './balances';

export async function listBrokerBalances(): Promise<BrokerBalance[]> {
  const {data,error}=await getSupabaseAdmin().rpc('accounting_list_broker_balances');
  if(error) throw error;
  return data;
}
export async function setBrokerBalance(body: Record<string,unknown>, actor: WorkspaceUser) {
  const balance=balanceAmount(body.balance),version=balanceVersion(body.version);
  const rows=await listBrokerBalances();
  const broker=rows.find(b=>b.broker===body.broker);
  if(!broker) throw new AccountingError('Courtier introuvable.');
  if(!canEditBalance(actor,broker.broker)) throw new AccountingError('Vous pouvez modifier uniquement votre propre solde.',403);
  const {data,error}=await getSupabaseAdmin().rpc('accounting_set_broker_balance',{
    p_broker:broker.broker,p_balance:balance,p_actor:actor,p_expected_version:version,
  });
  if(error?.code==='40001') throw new AccountingError('Ce solde a été modifié entre-temps. Annulez puis actualisez le panneau avant de réessayer.',409);
  if(error) throw error;
  return {...data[0],label:broker.label} as BrokerBalance;
}
