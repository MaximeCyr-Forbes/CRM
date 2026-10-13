import type { MortgageReferral } from '../../data/mortgage-referral-types';
import { ReferralError } from './validation';
export const paymentAmountMessage = 'Indiquez le montant réellement reçu pour confirmer le paiement.';
// Normalize decimal input without allowing exponent notation, rounding, or partial parsing.
export function paymentAmount(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') throw new ReferralError(paymentAmountMessage);
  const text = String(value).trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) throw new ReferralError(paymentAmountMessage);
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (cents <= BigInt(0) || cents > BigInt("999999999999")) throw new ReferralError(paymentAmountMessage);
  return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
}
export function paymentDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01'
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new ReferralError('Date du paiement invalide.');
  return value;
}
export type ReferralPayment = Pick<MortgageReferral, 'broker'|'paid_at'|'paid_amount'>;
export function paymentSummary(rows: ReferralPayment[], broker: string, year: number) {
  const relevant = rows.filter(row => row.broker === broker);
  const paid = relevant.filter(row => row.paid_at?.slice(0,4) === String(year) && row.paid_amount != null);
  const cents = paid.reduce((sum,row) => sum + BigInt(paymentAmount(row.paid_amount).replace('.', '')), BigInt(0));
  return { upcoming: relevant.filter(row => !row.paid_at).length, paid: paid.length, amount: `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2,'0')}` };
}
export function paymentMoney(amount: string | number) {
  // Format the integer part as BigInt so even a large aggregate keeps exact cents.
  const [whole, fraction = ''] = String(amount).split('.');
  return `${new Intl.NumberFormat('fr-CA').format(BigInt(whole))},${fraction.padEnd(2,'0')} $`;
}
