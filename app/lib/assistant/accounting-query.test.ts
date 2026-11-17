import {expect,it} from 'vitest';
import {selectAccounting} from './accounting-query';
import {recognizeIntent} from './intents';
import type {Expense} from '../accounting/model';
const row=(date:string|null,amount:number,extra:Partial<Expense>={}):Expense=>({id:String(amount),vendor:'ImmoPlus',description:'Abonnement',assigned_broker:null,category:'operation',expense_date:date,amount,is_paid:false,paid_at:null,created_at:'2026-01-01',updated_at:'2026-01-01',created_by:'maxime',updated_by:'maxime',notes:'',renewal_date:null,invoice:null,...extra});
const args={query:'Immoplus',mode:'latest' as const,unpaid:false};
it('latest uses expense date, not creation order',()=>{const r=selectAccounting([row('2026-02-01',20,{created_at:'2026-11-01'}),row('2026-05-01',50),row('2026-03-01',30)],args);expect(r.data.map(r=>r.amount)).toEqual([50]);});
it('no matching provider produces no made up amount',()=>{expect(selectAccounting([row('2026-01-01',10)],{...args,query:'Absent'}).data).toEqual([]);});
it('normalizes accents, spaces and punctuation after exact matching',()=>{expect(selectAccounting([row('2026-01-01',10,{vendor:'Immó Plus'})],args).data).toHaveLength(1);expect(selectAccounting([row('2026-01-01',10),row('2026-12-01',20,{vendor:'ImmoPlus Autre'})],args).data[0].amount).toBe(10);});
it('homonyms across allocations require clarification',()=>{const r=selectAccounting([row('2026-01-01',10),row('2026-12-01',20,{assigned_broker:'france'})],args);expect(r.explanation).toContain('Précisez');expect(r.data).toHaveLength(2);});
it('missing date cannot be called latest',()=>{const r=selectAccounting([row(null,10),row('2026-01-01',20)],args);expect(r.explanation).toContain('Impossible de garantir');expect(r.data).toHaveLength(2);});
it('payment uses paid_at and excludes unpaid expenses',()=>{const r=selectAccounting([row('2026-12-01',10),row('2026-01-01',20,{is_paid:true,paid_at:'2026-10-01'}),row('2026-11-01',30,{is_paid:true,paid_at:'2026-09-01'})],{...args,mode:'payment'});expect(r.data[0].amount).toBe(20);expect(r.explanation).toContain('paid_at');});
it('invoice requires document and explicitly uses upload date',()=>{const r=selectAccounting([row('2026-12-01',10),row('2026-01-01',20,{invoice:{id:'i',file_name:'synthetic.pdf',mime_type:'application/pdf',size:2,uploaded_at:'2026-10-01'}})],{...args,mode:'invoice'});expect(r.data).toHaveLength(1);expect(r.data[0].amount).toBe(20);expect(r.explanation).toContain('non par date de facturation');});
it('paid total is full result, not bounded excerpt; missing amounts never sum as zero',()=>{const r=selectAccounting(Array.from({length:8},(_,i)=>row('2026-01-01',i+1,{is_paid:true})),{...args,mode:'paid_total'});expect(r.total).toBe(36);expect(r.data).toHaveLength(5);expect(selectAccounting([row('2026-01-01',1,{is_paid:true,amount:null})],{...args,mode:'paid_total'}).total).toBeUndefined();});
it('unpaid filter does not include paid or mutate source',()=>{const source=[row('2026-01-01',10),row('2026-02-01',20,{is_paid:true})];const copy=JSON.stringify(source);expect(selectAccounting(source,{...args,mode:'expenses',unpaid:true}).data.map(r=>r.amount)).toEqual([10]);expect(JSON.stringify(source)).toBe(copy);});
it('period totals include every matching row, not only the five shown',()=>{
 const source=[...Array.from({length:12},(_,i)=>row('2026-11-01',i+1)),row('2026-10-31',500),row('2026-12-01',600)];
 const r=selectAccounting(source,{query:'',mode:'expenses',unpaid:false,from:'2026-11-01',to:'2026-11-30',aggregate:true});
 expect(r.total).toBe(78);expect(r.data).toHaveLength(5);expect(r.truncated).toBe(true);
});
it('payment and invoice periods filter the official event date, not expense creation',()=>{
 const source=[row('2026-01-01',20,{paid_at:'2026-11-03',is_paid:true}),row('2026-11-01',50,{paid_at:'2026-12-01',is_paid:true})];
 expect(selectAccounting(source,{...args,mode:'paid_total',from:'2026-11-01',to:'2026-11-30'}).total).toBe(20);
});
it.each([
 ['Quel est mon dernier montant chez Immoplus ?','latest','Immoplus'],
 ['Combien avons-nous payé à Immoplus ?','paid_total','Immoplus'],
 ['Trouve ma dernière dépense Immoplus.','latest','Immoplus'],
 ['Avons-nous une facture Immoplus ?','invoice','Immoplus'],
 ['Dernier paiement Immoplus','payment','Immoplus'],
 ['Quelles dépenses sont impayées ?','expenses',''],
])('recognizes %s', (q,mode,entity)=>{expect(recognizeIntent(q)).toMatchObject({intent:'accounting',accountingMode:mode,entity});});
