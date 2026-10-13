import { AccountingError } from './model';
import { workspaceCapabilities, type WorkspaceUser } from '../workspace';

export type BrokerBalance = { broker: string; label: string; balance: string; version: number; updated_at: string | null; updated_by: string | null };
export function canEditBalance(actor: WorkspaceUser | null, broker: string) {
  if (!actor) return false;
  const role=workspaceCapabilities(actor).role;
  return actor===broker || role==='admin' || role==='assistant';
}
// Decimal string throughout validation/storage; Number is used only for CAD display.
export function balanceAmount(input: unknown): string {
  if (typeof input!=='string') throw new AccountingError('Saisissez un montant valide.');
  const raw=input.trim().replace(/[ \u00a0\u202f]/g,'').replace(',','.');
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(raw)) throw new AccountingError('Montant invalide : au plus deux décimales.');
  const negative=raw.startsWith('-'), [whole,fraction='']=raw.replace('-','').split('.');
  const cents=BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
  return `${negative&&cents!==BigInt(0)?'-':''}${cents/BigInt(100)}.${String(cents%BigInt(100)).padStart(2,'0')}`;
}
export function balanceVersion(input: unknown) {
  if (typeof input!=='number' || !Number.isInteger(input) || input<0 || input>=2147483647) throw new AccountingError('Version du solde invalide. Rouvrez le panneau.');
  return input;
}
