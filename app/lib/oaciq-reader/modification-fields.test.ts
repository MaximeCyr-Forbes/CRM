import {describe,it,expect} from 'vitest';
import {document,promise,word,counter} from './test-fixtures';
import {parseModifications,formReferences} from './modifications';
import {analyzeExtractedOaciqDocuments as analyze} from './parser';
import {analyzeOaciqDocuments} from './index';
import {extractResponseAction,parseCounterProposal} from './forms';
const mo=(body:string,target='PA 10001',number='60006')=>document(`MO-${number}.pdf`,`MODIFICATIONS\nMO ${number}\nM1. IDENTIFICATION DU FORMULAIRE PRINCIPAL\n${target}\nportant sur l'immeuble adresse suivante : 123 rue Exemple Ville-Test QC H0H 0H0\nM2.\n${body}\nM5. AUTRES CONDITIONS\nM5.1 Toutes les autres conditions demeurent inchangées.`);
const m4=(text:string,target='PA 10001',number='60006')=>mo(`M3.1\nM3.2\nM4. AUTRES MODIFICATIONS\n${text}`,target,number);
describe('generic sparse MO amendments',()=>{
 it('reads split PAD and brokerage subtypes without confusing the own MO number',()=>{
  expect(formReferences('Contrat CC D 30003 Promesse PA D 10001 Autre CP-20002')).toEqual(['CCD 30003','PAD 10001','CP 20002']);
 });
 it('reads M3.1 as expiry only, never actual acceptance or an agenda event',()=>{
  const r=analyze([promise(),mo("M3.1 Le délai d'acceptation mentionné à la clause 14.1 est prolongé jusqu'à 18 h 00 le 3 novembre 2026\nM3.2\nM4.")]);
  expect(r.documentaryState?.acceptanceDeadline).toMatchObject({date:'2026-11-03',time:'18:00'});
  expect(r.deadlines.some(d=>d.sourceSection==='14.1')).toBe(false);
 });
 it('changes only the named M3.2 clause',()=>{
  const base=analyze([promise()]); const r=analyze([promise(),mo('M3.1\nM3.2 Le délai mentionné à la clause 8.1 est prolongé au 12 novembre 2026\nM4.')]);
  expect(r.deadlines.find(d=>d.type==='inspection')?.dueDate).toBe('2026-11-12');
  expect(r.transactionDates.financing_deadline).toBe(base.transactionDates.financing_deadline);
 });
 it('keeps brokerage M2 changes documentary, never changing a purchase price',async()=>{
  const d=mo('M2.1 DATE DE FIN La date de fin sera le 10 décembre 2026\nM2.2 PRIX DE VENTE sera de 525000 $\nM3.','CCD 30003');
  const patches=parseModifications(d);expect(patches).toHaveLength(2);
  expect(patches[1]).toMatchObject({amount:525000,targetForm:'CCD 30003'});
  const r=await analyzeOaciqDocuments([d]);expect(r.documentaryState?.modifications).toHaveLength(2);expect(r.finalPrice).toBeNull();
 });
 it('changes occupation alone without changing notary or other conditions',()=>{
  const before=analyze([promise()]);const r=analyze([promise(),m4("La date d'occupation est modifiée au 9 novembre 2026.")]);
  expect(r.transactionDates.occupancy_date).toBe('2026-11-09');expect(r.transactionDates.deed_of_sale_date).toBe(before.transactionDates.deed_of_sale_date);
  expect(r.transactionDates.financing_deadline).toBe(before.transactionDates.financing_deadline);
 });
 it('reads both leading clauses with one common date, including split PAD M1',()=>{
  const r=analyze([promise({pad:true}),m4("11.1 et 11.2 La date d'occupation sera la même que la date d'acte de vente soit le 9 novembre 2026.",'PA D 10001')]);
  expect(r.transactionDates).toMatchObject({deed_of_sale_date:'2026-11-09',occupancy_date:'2026-11-09'});
  expect(r.documentaryState?.modifications.every(m=>m.applied)).toBe(true);
 });
 it('ignores internal clause references and keeps distinct dates',()=>{
  const d=m4("11.1 ACTE DE VENTE le 15 décembre 2026. Le courtier mentionné à la clause 2.1 transmettra les informations.\n11.2 OCCUPATION le 19 décembre 2026 à 12:00.\n11.3 Répartitions à l'acte.");
  expect(parseModifications(d).map(m=>[m.section,m.date,m.time])).toEqual([['11.1','2026-12-15',null],['11.2','2026-12-19','12:00']]);
 });
 it('applies the latest dated amendment independent of upload order; ambiguous conflicts stay pending',()=>{
  const a=m4('11.1 Acte le 9 novembre 2026'),b=m4('11.1 Acte le 10 novembre 2026','PA 10001','70007');
  expect(analyze([promise(),a,b]).transactionDates.deed_of_sale_date).toBe('2026-11-23');
  for(const [d,date] of [[a,'2026-10-01T10:00:00-04:00'],[b,'2026-10-02T10:00:00-04:00']] as const)d.signatures.push({field:'signature',name:'Test',contact:'',reason:'',signedAt:date});
  expect(analyze([b,promise(),a]).transactionDates.deed_of_sale_date).toBe('2026-11-10');
 });
 it('does not apply an unmatched MO to the only PA',()=>{
  const r=analyze([promise(),m4('11.1 Acte le 9 novembre 2026','PA 90009')]);expect(r.transactionDates.deed_of_sale_date).toBe('2026-11-23');expect(r.documentaryState?.modifications[0].applied).toBe(false);
 });
 it('retains usable fields when OCR leaves another date blank; ignores footer creation date',()=>{
  const r=parseModifications(m4('11.1 Acte le ...\n11.2 Occupation le 9 novembre 2026\n(v17 08/2025) Généré le 2026-10-30'));
  expect(r).toHaveLength(1);expect(r[0].section).toBe('11.2');
 });
 it('replaces a purchase price without changing the dates',()=>{
  const r=analyze([promise(),m4("Le prix de vente est modifié à 525000 $.")]);expect(r.finalPrice).toBe(525000);expect(r.transactionDates.deed_of_sale_date).toBe('2026-11-23');
 });
 it('retains CP as explicit M1 target',()=>expect(parseModifications(m4('P2.3.2 Acte le 9 novembre 2026','CP 20002'))[0].targetForm).toBe('CP 20002'));
 it('reads M4 continuation pages and never M5 as an amendment',()=>{
  const d=m4('11.1 Acte le 9 novembre 2026');d.pages.push({...d.pages[0],text:'M4. AUTRES MODIFICATIONS (suite)\n11.2 Occupation le 12 novembre 2026\nM5. AUTRES CONDITIONS\nM5.1 Inchangées'});
  expect(parseModifications(d).map(m=>m.section)).toEqual(['11.1','11.2']);
 });
 it('recognizes a flattened declaration above its baseline, excludes printed choices and footer CP',()=>{
  const d=document('CP.pdf','CONTRE-PROPOSITION\nRÉPONSE DU RÉPONDANT',[word('RÉPONSE DU RÉPONDANT',310,200),word('Il',310,230),word('déclare',320,230),word('Accepter',385,220),word('ACCEPTER OU REFUSER',420,240),word('Signé à',310,270),word('CP-',510,760),word('20002',540,760)]);
  expect(extractResponseAction(d,true).action).toBe('accept');d.pages[0].words=d.pages[0].words.filter(w=>w.text!=='Accepter');expect(extractResponseAction(d,true).action).toBe('unknown');
 });
 it('adds an extension once and preserves the report offset',()=>{
  const base=analyze([promise()]); const r=analyze([promise(),m4("Le financement est prolongé de 5 jours.")]);
  expect(r.deadlines.find(d=>d.type==='financing')?.days).toBe((base.deadlines.find(d=>d.type==='financing')?.days ?? 0)+5);
 });
 it('retains valid amendments alongside an impossible date',()=>{
  const patches=parseModifications(m4('11.1 Acte le 31 février 2026\n11.2 Occupation le 9 novembre 2026'));
  expect(patches.find(m=>m.section==='11.2')?.date).toBe('2026-11-09');
 });
});

it('uses the named visible respondent stamp, not a later proposer timestamp',()=>{
 const d=counter();d.annotations=[];d.signatures=[];
 d.pages[0].text=d.pages[0].text.replace('RÉPONSE DU RÉPONDANT','RÉPONSE DU RÉPONDANT\nSigné le 2026-10-30 18:00:00');
 d.pages[0].words.push(word('Alice Exemple',340,140),word('RÉPONSE DU RÉPONDANT',310,500),word('Il',310,530),word('déclare',320,530),word('Accepter',380,520),word('Signé à',310,560),word('Alice Exemple',380,590),word('SIGNATURE DU RÉPONDANT',310,607),word('Signé',379,608),word('1',380,607),word('le',400,608),word('2026-10-28',420,608),word('16:39:36',460,608));
 expect(parseCounterProposal(d)).toMatchObject({responseAction:'accept',acceptedAt:'2026-10-28T16:39:36-04:00',signaturesComplete:true});
});


describe('MO brokerage principal consolidation',()=>{
 const contract=()=>document('contract.pdf','CONTRAT DE COURTAGE EXCLUSIF VENTE\nCCD 30003\n4.1 Prix demandé 550000 $');
 it('updates only asking price and expiry on the exact provided contract, without a purchase agreement',async()=>{
  const parent=contract(), snapshot=JSON.stringify(parent);
  const result=await analyzeOaciqDocuments([parent,mo('M2.1 DATE DE FIN Le délai de la clause 2.1 est le 10 décembre 2026\nM2.2 PRIX DE VENTE Le prix de la clause 4.1 sera de 525000 $\nM3.','CCD 30003')]);
  expect(result.forms).toContainEqual({document:'contract.pdf',kind:'brokerage_contract',number:'30003'});
  expect(result.documentaryState?.brokerageContracts).toMatchObject([{targetForm:'CCD 30003',changes:{askingPrice:525000,expirationDate:'2026-12-10'}}]);
  expect(result.documentaryState?.modifications.every(m=>m.applied)).toBe(true);
  expect(result.deadlines).toEqual([]);expect(result.finalPrice).toBeNull();expect(JSON.stringify(parent)).toBe(snapshot);
 });
 it('preserves the purchase price when brokerage M2 is in a mixed dossier',()=>{
  const base=analyze([promise()]); const result=analyze([promise(),contract(),mo('M2.2 PRIX DE VENTE 525000 $\nM3.','CCD 30003')]);
  expect(result.finalPrice).toBe(base.finalPrice);
  expect(result.documentaryState?.brokerageContracts?.[0].changes).toEqual({askingPrice:525000});
 });
 it('does not apply M2 to the wrong or duplicated brokerage contract',async()=>{
  const m=mo('M2.2 PRIX DE VENTE 525000 $\nM3.','CCD 90009');
  const result=await analyzeOaciqDocuments([contract(),m]);expect(result.documentaryState?.brokerageContracts).toEqual([]);
  const duplicate=contract();duplicate.name='duplicate.pdf';
  const r=await analyzeOaciqDocuments([contract(),duplicate,mo('M2.2 PRIX DE VENTE 525000 $\nM3.','CCD 30003')]);expect(r.documentaryState?.brokerageContracts).toEqual([]);
 });
 it('uses the shared conflict rule and keeps contradictory undated M2 pending',async()=>{
  const r=await analyzeOaciqDocuments([contract(),mo('M2.2 PRIX DE VENTE 525000 $\nM3.','CCD 30003'),mo('M2.2 PRIX DE VENTE 520000 $\nM3.','CCD 30003','70007')]);
  expect(r.documentaryState?.brokerageContracts).toEqual([]);expect(r.documentaryState?.modifications.every(m=>!m.applied)).toBe(true);
 });
});
