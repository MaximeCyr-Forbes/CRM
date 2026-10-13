import {beforeEach,describe,expect,it,vi} from 'vitest';
import {paymentAmount,paymentDate,paymentMoney,paymentSummary,type ReferralPayment} from './payments';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase/server',()=>({getSupabaseAdmin:()=>({rpc:mocks.rpc})}));
import {saveReferralPayment} from './payment-server';
const id='11111111-1111-4111-8111-111111111111';
const body={action:'payment',broker:'france',paid_amount:'1 250,50',paid_at:'2026-10-13',payment_version:0};
beforeEach(()=>mocks.rpc.mockReset().mockResolvedValue({data:{id},error:null}));
describe('mortgage payment validation',()=>{
 it.each(['', ' ', '-1','0','0,00','12abc','1e3','1.234','NaN','Infinity',null,{},'10000000000'])('rejects invalid amount %j',value=>expect(()=>paymentAmount(value)).toThrow());
 it.each(['1250,50','1250.50','1 250,50','1\u202f250,50',1250.5])('normalizes decimal %j',value=>expect(paymentAmount(value)).toBe('1250.50'));
 it.each(['2026-02-30','2025-02-29','2026-13-01','2026-00-01','13/10/2026','','1899-12-31',null])('rejects date %j',value=>expect(()=>paymentDate(value)).toThrow());
 it('accepts leap days and formats CAD cents exactly',()=>{expect(paymentDate('2028-02-29')).toBe('2028-02-29');expect(paymentMoney('1250.50').replace(/\s/g,' ')).toBe('1 250,50 $');});
});
describe('annual revenue',()=>{
 const rows: ReferralPayment[]=[{broker:'maxime',paid_amount:1000,paid_at:'2026-01-01'},{broker:'maxime',paid_amount:500,paid_at:'2026-12-31'},{broker:'maxime',paid_amount:null,paid_at:null},{broker:'maxime',paid_amount:800,paid_at:'2025-12-31'},{broker:'france',paid_amount:2000,paid_at:'2026-10-13'}];
 it('includes only the selected broker and payment year',()=>{expect(paymentSummary([...rows],'maxime',2026)).toEqual({upcoming:1,paid:2,amount:'1500.00'});expect(paymentSummary([...rows],'france',2026).amount).toBe('2000.00');expect(paymentSummary([...rows],'maxime',2025).amount).toBe('800.00');});
 it('keeps old upcoming references independently of year',()=>expect(paymentSummary([...rows],'maxime',2027)).toEqual({upcoming:1,paid:0,amount:'0.00'}));
 it('moves corrected payments between years and removes cancelled/deleted payments',()=>{const changed=rows.map(r=>({...r}));changed[0]={...changed[0],paid_amount:1250,paid_at:'2025-12-31'};expect(paymentSummary(changed,'maxime',2025).amount).toBe('2050.00');expect(paymentSummary(changed,'maxime',2026).amount).toBe('500.00');changed[1]={...changed[1],paid_amount:null,paid_at:null};expect(paymentSummary(changed,'maxime',2026).amount).toBe('0.00');expect(paymentSummary(changed.slice(2),'maxime',2025).amount).toBe('800.00');});
 it('adds cents without floating point drift',()=>expect(paymentSummary([{broker:'maxime',paid_at:'2026-01-01',paid_amount:'0.10'},{broker:'maxime',paid_at:'2026-01-01',paid_amount:'0.20'}],'maxime',2026).amount).toBe('0.30'));
});
describe('payment server permissions and writes',()=>{
 it('uses the verified actor, not an actor supplied in the body',async()=>{await saveReferralPayment(id,{...body,payment_updated_by:'maxime'},'immoplus');expect(mocks.rpc).toHaveBeenCalledWith('mortgage_referral_payment',{p_id:id,p_broker:'france',p_amount:'1250.50',p_date:'2026-10-13',p_version:0,p_actor:'immoplus'});});
 it('rejects missing identity',async()=>{await expect(saveReferralPayment(id,body,null)).rejects.toThrow('espace');expect(mocks.rpc).not.toHaveBeenCalled();});
 it('rejects a broker modifying another broker payment',async()=>{await expect(saveReferralPayment(id,body,'sandrine')).rejects.toThrow('autre courtier');expect(mocks.rpc).not.toHaveBeenCalled();});
 it('requires confirmation to cancel and clears both fields together',async()=>{await expect(saveReferralPayment(id,{...body,action:'cancel-payment'},'france')).rejects.toThrow('Confirmez');await saveReferralPayment(id,{...body,action:'cancel-payment',confirm:true},'france');expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_amount:null,p_date:null});});
 it('requires a version and preserves concurrency errors',async()=>{await expect(saveReferralPayment(id,{...body,payment_version:undefined},'france')).rejects.toThrow('Version');mocks.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Le paiement a changé.'}});await expect(saveReferralPayment(id,body,'france')).rejects.toMatchObject({status:409});});
});
