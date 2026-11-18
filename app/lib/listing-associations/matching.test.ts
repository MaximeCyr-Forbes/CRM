import {it,expect} from 'vitest';
import {matchRecords,normalizeAddress,rankMatches,withLinkConflicts,type Entity,type Association} from './matching';
import {associationView,associationSummary} from './server';
const l:Entity={id:'listing',address:'120 Av. Exemple E., Montréal, H1A 1A1',city:'Montréal',postal:'H1A 1A1',centris:'12345678',broker:'maxime',status:'active',type:'sale',price:500000,createdAt:'2026-01-01',updatedAt:'2026-01-01'};
const t:Entity={...l,id:'transaction',city:undefined,postal:undefined,address:'120 avenue Exemple Est, Montréal, QC H1A1A1',status:'new',price:490000};
it.each(['120 avenue Exemple Est, Montréal, H1A 1A1','120 Av Exemple E Montréal QC H1A1A1','120 av. exemple est, Montreal, Quebec H1A 1A1'])('normalizes complete address: %s',address=>expect(matchRecords({...l,centris:''},{...t,centris:'',address}).kind).toBe('EXACT_ADDRESS'));
it.each([['Boulevard','Boul.'],['Rue','R.'],['Avenue','Av'],['Saint','St'],['Sainte','Ste'],['Ouest','O.'],['Est','E'],['Québec','QC']])('equivalent %s / %s',(a,b)=>expect(normalizeAddress(a)).toBe(normalizeAddress(b)));
it('exact Centris remains the strongest evidence and prices are independent',()=>{const before=JSON.stringify([l,t]);expect(matchRecords(l,t)).toMatchObject({kind:'EXACT_CENTRIS',historical:false});expect(JSON.stringify([l,t])).toBe(before);});
it.each([
 ['unit',{...l,unit:'101'},{...t,address:t.address+' app. 202'}],
 ['civic',l,{...t,address:t.address.replace('120','121')}],
 ['direction',l,{...t,address:t.address.replace('Est','Ouest')}],
 ['purpose',{...l,type:'rental'},t],
 ['purchase',l,{...t,type:'purchase'}],
 ['street',l,{...t,address:t.address.replace('Exemple','Différente')}],
 ['missing unit',{...l,unit:'101'},t],
 ] as const)('Centris does not hide %s conflict',(_name,a,b)=>expect(matchRecords(a,b).kind).toBe('CONFLICT'));
it('same street different civic without Centris is not a match',()=>expect(matchRecords({...l,centris:''},{...t,centris:'',address:t.address.replace('120','121')}).kind).toBe('NO_MATCH'));
it('same civic and street without geography is possible, not certain',()=>expect(matchRecords({...l,centris:'',city:undefined,postal:undefined,address:'120 Av. Exemple E.'},{...t,centris:'',address:'120 avenue Exemple Est'}).kind).toBe('POSSIBLE_MATCH'));
it('a missing postal code lowers the address category',()=>expect(matchRecords({...l,centris:''},{...t,centris:'',address:'120 avenue Exemple Est Montréal'}).kind).toBe('HIGH_CONFIDENCE_ADDRESS'));
const association:Association={id:'a',listingId:l.id,transactionId:t.id,kind:'primary',source:'documentary',version:1,createdAt:'2026-01-01',createdBy:'maxime',detachedAt:null,detachedBy:null};
it('current exact transaction precedes cancelled history regardless of price/date',()=>{const cancelled={...t,id:'old',status:'cancelled',price:900000,createdAt:'2027'};const candidates=[cancelled,t].map(entity=>({entity,match:matchRecords(l,entity)})).sort(rankMatches);expect(candidates.map(c=>c.entity.id)).toEqual([t.id,'old']);});
it('links elsewhere are explicit conflicts',()=>expect(withLinkConflicts(matchRecords(l,t),l.id,t.id,[{...association,listingId:'other'}],[t])).toMatchObject({blocked:true,reasons:expect.arrayContaining(['Transaction déjà liée à un autre Listing'])}));
it('bidirectional view recognizes official PA links and never suggests a duplicate',()=>{const data={listings:[l],transactions:[t],associations:[{...association,source:'accepted_offer' as const}]};for(const [side,id] of [['listing',l.id],['transaction',t.id]] as const){const v=associationView(data,side,id);expect(v.linked).toHaveLength(1);expect(v.candidates).toHaveLength(0);}expect(associationSummary(data)).toEqual({listings:[],transactions:[]});});
it('summary is read-only and suggests exact non-cancelled candidates',()=>{const data={listings:[l],transactions:[t,{...t,id:'old',status:'cancelled'}],associations:[]};const before=JSON.stringify(data);expect(associationSummary(data)).toEqual({listings:[l.id],transactions:[t.id]});expect(JSON.stringify(data)).toBe(before);});
it('manual search finds candidates without match evidence, by civic/city/Centris',()=>{const data={listings:[l],transactions:[{...t,address:'999 rue Autre, Ville Exemple',centris:'87654321'}],associations:[]};expect(associationView(data,'listing',l.id).candidates).toHaveLength(0);for(const q of ['999','Ville Exemple','87654321'])expect(associationView(data,'listing',l.id,q).candidates).toHaveLength(1);});
it('detached associations remain in history and allow an explicit new suggestion',()=>{const v=associationView({listings:[l],transactions:[t],associations:[{...association,detachedAt:'2026-02-01'}]},'listing',l.id);expect(v.linked).toHaveLength(1);expect(v.candidates).toHaveLength(1);});
