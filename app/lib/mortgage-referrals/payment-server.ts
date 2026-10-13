import { getSupabaseAdmin } from '../supabase/server';
import { isWorkspaceUser, type WorkspaceUser } from '../workspace';
import { ReferralError, referralBroker, referralId } from './validation';
import { paymentAmount, paymentDate } from './payments';
export async function saveReferralPayment(id: string, body: Record<string,unknown>, actor: WorkspaceUser | null) {
  if (!isWorkspaceUser(actor)) throw new ReferralError('Sélectionnez votre espace utilisateur.',403);
  const broker = referralBroker(body.broker);
  if (actor !== broker && actor !== 'maxime' && actor !== 'immoplus') throw new ReferralError('Ce paiement appartient à un autre courtier.',403);
  if (!Number.isInteger(body.payment_version) || Number(body.payment_version)<0) throw new ReferralError('Version du paiement invalide.');
  if (body.action !== 'payment' && body.action !== 'cancel-payment') throw new ReferralError('Action invalide.');
  const cancel = body.action === 'cancel-payment';
  if (cancel && body.confirm !== true) throw new ReferralError('Confirmez l’annulation du paiement.');
  const {data,error} = await getSupabaseAdmin().rpc('mortgage_referral_payment', {
    p_id: referralId(id), p_broker: broker, p_amount: cancel ? null : paymentAmount(body.paid_amount),
    p_date: cancel ? null : paymentDate(body.paid_at), p_version: body.payment_version, p_actor: actor,
  });
  if (error) { if (error.code==='P0001') throw new ReferralError(error.message,409); throw error; }
  return data;
}
