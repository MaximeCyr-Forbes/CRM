import {describe,it,expect} from 'vitest';
import {document,promise,counter,annexWater} from './test-fixtures';
import {analyzeExtractedOaciqDocuments as analyze} from './parser';
import {parseBonification} from './bonifications';
import {documentKind} from './forms';
import {emailTransactionFromAnalysis,groupEmailDocuments} from '../tools/email/analysis';

const bo=(text='',number='60001',date='2026-08-14',current=true,price='')=>document(`upload-${number}.pdf`,[
 'FORMULAIRE OBLIGATOIRE\nBONIFICATIONS AVANT ACCEPTATION',
 'B1. IDENTIFICATION DU FORMULAIRE PRINCIPAL\nPromesse d’achat PA D - 10001',
 `B2. BONIFICATION\nB2.1 PRIX D’ACHAT ${price}\nB2.2 AUTRES\n${text}`,
 'B3. AUTRES CONDITIONS\nB3.1 Toutes les autres conditions demeurent inchangées.',
 current?'B3.2 Toute bonification antérieure faite par l’ACHETEUR est nulle et non avenue.':'',
 `B4. SIGNATURES\nSigné le ${date} 10:00:00\nBO ${number}`,
].join('\n'));
const pa=()=>{const d=promise();d.pages[0].text+='\n4.1 Prix 400000 $\n4.2';return d;};
const day=(r:ReturnType<typeof analyze>,type:string)=>r.deadlines.find(d=>d.type===type);
describe('BO targeted contract patches',()=>{
 it('does not order BO using a PDF certificate timestamp',()=>{
  const b=bo();b.pages[0].text=b.pages[0].text.replace('Signé le 2026-08-14 10:00:00','');
  b.signatures=[{field:'DigitalSignature',name:'',contact:'',reason:'',signedAt:'2026-08-20T10:00:00',certificateSignedAt:'2026-08-20T10:00:00'}];
  expect(parseBonification(b).signedAt).toBeNull();
  b.signatures[0].visibleSignedAt='2026-08-14T10:00:00';
  expect(parseBonification(b).signedAt).toBe('2026-08-14T10:00:00');
 });
 it('does not invent a removal from a negated instruction',()=>{
  const r=analyze([pa(),bo("La condition d’inspection de la clause 8.1 n’est pas retirée.")]);expect(day(r,'inspection')?.days).toBe(10);expect(r.warnings.join(' ')).toContain('B2.2 à confirmer');
 });
 it('recognizes OCR headings and boxed PAD reference without filename clues',()=>{
  const b=bo('11.1 Acte de vente 18 février 2027.');b.pages[0].text=b.pages[0].text.replace('B1.','I 1]').replace('B2. BONIFICATION','2] BONIFICATION DE LA PROMESSE D’ACHAT').replace('PA D - 10001','PA | D|-| 10001');
  expect(parseBonification(b).target).toBe('10001');expect(groupEmailDocuments([pa(),b])).toHaveLength(1);expect(day(analyze([pa(),b]),'notary')?.dueDate).toBe('2027-02-18');
 });
 it('shortens an existing deadline and updates the annex notice',()=>{
  const r=analyze([pa(),annexWater(),bo('Le délai de la clause V2.1 est réduit à 5 jours.')]);
  expect(r.deadlines.find(d=>d.sourceSection==='V2.1'&&d.type==='water_condition')?.days).toBe(5);
  expect(r.deadlines.find(d=>d.type==='water_notice')?.dateText).toContain('25 août');
 });
 it('classifies title and section/footer even with misleading filename',()=>{
  const b=bo();b.name='CP-99999.pdf';expect(parseBonification(b)).toMatchObject({number:'60001',target:'10001',versionDetected:'B3.2',previousBOvoided:true});
  expect(documentKind([b.pages[0].text.replace('BONIFICATIONS AVANT ACCEPTATION','')])).toBe('bonification');
 });
 it('applies B2.1 without turning price or B4 into a deadline',()=>{
  const r=analyze([pa(),bo('',undefined,undefined,true,'425000 $')]);expect(r.finalPrice).toBe(425000);expect(r.acceptanceDateTime).toContain('2026-08-16');expect(r.deadlines).toHaveLength(analyze([pa()]).deadlines.length);
 });
 it('patches dates and preserves unrelated deadlines and empty price',()=>{
  const r=analyze([pa(),bo('11.1 ACTE DE VENTE 18 février 2027.\n11.2 OCCUPATION 19 février 2027 à 8h00.')]);
  expect(r.transactionDates).toMatchObject({deed_of_sale_date:'2027-02-18',occupancy_date:'2027-02-19',occupancy_time:'8h'});expect(r.finalPrice).toBe(400000);expect(day(r,'financing')?.days).toBe(15);
 });
 it('replaces a delay once and recalculates its dependent report',()=>{
  const r=analyze([pa(),bo('La clause 8.1 est modifiée : 5 jours suivant l’acceptation.')]);expect(day(r,'inspection')?.days).toBe(5);expect(day(r,'inspection_report')?.days).toBe(9);expect(r.deadlines.filter(d=>d.type==='inspection')).toHaveLength(1);
 });
 it('removes condition and dependent report',()=>{
  const r=analyze([pa(),bo('La condition d’inspection de la clause 8.1 est retirée.')]);expect(day(r,'inspection')).toBeUndefined();expect(day(r,'inspection_report')).toBeUndefined();
 });
 it('voids all prior BO patches including price, restoring baseline',()=>{
  const old=bo('La clause 8.1 est modifiée : 5 jours après l’acceptation.','60001','2026-08-13',false,'420000 $');
  const newer=bo('11.1 Acte de vente 18 février 2027.','60002');
  for(const docs of [[pa(),old,newer],[newer,old,pa()]]){const r=analyze(docs);expect(day(r,'inspection')?.days).toBe(10);expect(r.finalPrice).toBe(400000);expect(r.documentaryState?.bonifications?.find(b=>b.number==='60001')?.superseded).toBe(true);}
 });
 it('keeps legacy compatible patches cumulative including earlier price',()=>{
  const r=analyze([pa(),bo('La clause 8.1 est modifiée : 5 jours après l’acceptation.','60001','2026-08-13',false,'420000 $'),bo('11.1 Acte de vente 18 février 2027.','60002',undefined,false)]);
  expect(day(r,'inspection')?.days).toBe(5);expect(r.finalPrice).toBe(420000);
 });
 it('explicit legacy replacement voids earlier patches',()=>{
  const r=analyze([pa(),bo('11.1 Acte de vente 18 février 2027.','60001','2026-08-13',false),bo('Cette bonification remplace toutes les bonifications précédentes.','60002',undefined,false)]);expect(day(r,'notary')?.dueDate).toBe('2026-11-23');
 });
 it('accepted CP dates override BO dates',()=>{
  const r=analyze([promise({counter:'20002'}),counter(),bo('11.1 Acte de vente 18 février 2027.')]);expect(day(r,'notary')?.dueDate).toBe('2026-11-20');
 });
 it('MO overrides BO without reapplying it',()=>{
  const mo=document('amendment.pdf','MODIFICATIONS\nMO 80001\nM1. PA 10001\nM2.\nM4.\n11.1 Acte de vente 20 février 2027.\nM5.');
  expect(day(analyze([pa(),mo,bo('11.1 Acte de vente 18 février 2027.')]),'notary')?.dueDate).toBe('2027-02-20');
 });
 it('retains unresolved relative deadline without accepting BO signature',()=>{
  const r=analyze([promise({accepted:false}),bo('La clause 6.2 est modifiée : 8 jours après l’acceptation.')]);expect(r.acceptanceDateTime).toBeNull();expect(day(r,'financing')).toMatchObject({days:8,dueDate:null});
 });
 it('ignores foreign PA and keeps ambiguous text as warning',()=>{
  const b=bo('Faire ce qui sera nécessaire.');expect(parseBonification(b).warnings.length).toBeGreaterThan(0);b.pages[0].text=b.pages[0].text.replace('10001','99999');expect(analyze([pa(),b]).finalPrice).toBe(400000);expect(analyze([pa(),b]).documentaryState?.bonifications?.[0].applicable).toBe(false);
 });
 it('keeps deposit out of deadlines and exposes it to generator',()=>{
  const docs=[pa(),bo('Acompte de 10000 $.')];const r=analyze(docs);expect(r.finalContract?.deposit.value).toBe(10000);expect(emailTransactionFromAnalysis(r,docs).terms.deposit.value).toBe(10000);
 });
 it('resolves occupation at notary',()=>{
  const r=analyze([pa(),bo('11.1 Acte de vente 18 février 2027.\n11.2 Occupation à l’acte notarié.')]);expect(day(r,'occupancy')?.dueDate).toBe('2027-02-18');
 });
 it('never selects conflicting BO by upload order',()=>{
  const a=bo('11.1 Acte de vente 18 février 2027.'),b=bo('11.1 Acte de vente 19 février 2027.','60002');const r=analyze([pa(),a,b]);expect(day(r,'notary')?.dueDate).toBe('2026-11-23');expect(r.warnings.join(' ')).toContain('ordre documentaire');
 });
 it('matches a unique address only when B1 has no contrary number',()=>{
  const p=pa();p.pages[0].text+="\n3. DESCRIPTION SOMMAIRE DE L’IMMEUBLE\n3.1 L’immeuble est décrit comme suit :\n100 rue Exemple, Ville Exemple, QC, H0H 0H0\n4.1";
  const b=bo('11.1 Acte de vente 18 février 2027.');b.pages[0].text=b.pages[0].text.replace('PA D - 10001','PA\nportant sur l’immeuble situé à l’adresse suivante : 100 rue Exemple, Ville Exemple, QC, H0H 0H0');
  const r=analyze([p,b]);expect(groupEmailDocuments([p,b])).toHaveLength(1);expect(r.documentaryState?.bonifications?.[0].mainFormMatch).toBe('address');expect(day(r,'notary')?.dueDate).toBe('2027-02-18');
 });
 it('keeps B2.2 price below a later CP price',()=>{
  const cp=counter();cp.pages[0].text=cp.pages[0].text.replace('P2.3.2','P2.3.1 Prix 440000 $\nP2.3.2');
  expect(analyze([promise({counter:'20002'}),cp,bo('Le prix de la clause 4.1 est augmenté à 425000 $.')]).finalPrice).toBe(440000);
 });
});
