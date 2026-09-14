import { describe, expect, it } from 'vitest';
import { document, annexF } from './test-fixtures';
import { analyzeExtractedOaciqDocuments as analyze } from './parser';
import { analyzeOaciqDocuments } from './index';
import { parseAnnexF } from './annexes';
import { proposalsFromAnalysis, recalculateDeadlinesFromAcceptanceDate } from '../transactions/oaciq-agenda';
import { extractTransactionDetails } from './transaction-details';
import { prefillPromise } from '../transactions/oaciq-prefill-fixtures';

function dossier() {
  const pa=document('principal.pdf',`FORMULAIRE OBLIGATOIRE - PROMESSE D'ACHAT
PA 10001
3. DESCRIPTION SOMMAIRE DE L'IMMEUBLE
3.1 123 rue Test, Ville-Test, QC, H0H 0H0
3.2 Cadastre
4.1 PRIX D'ACHAT (450000 $)
4.2 Dépôt
6.2 dans les jours suivant l'acceptation
6.3 Absence
11.1 ACTE DE VENTE 14 octobre 2026
11.2 à l'acte notarié
11.3 Répartitions
12. AUTRES DÉCLARATIONS
12.1 L'acheteur doit vérifier le zonage et aviser le vendeur dans les 30 jours suivant l'acceptation.
13. Annexes
14.1 23 h 59 le 1 septembre 2026
15. Signatures`);
  const af=annexF(); af.name='financement.pdf';
  af.pages[0].words=af.pages[0].words.map(w=>w.text==='12' ? {...w,text:'5'} : w);
  af.pages[0].text="ANNEXE F - FINANCEMENT AF 40004\nF1.1 promesse d'achat PA 10001\nF2.1 dans les 5 jours suivant l'acceptation\nF2.2";
  const ar=document('retribution.pdf',"ANNEXE R AR 30003\nR1.1 PA 10001\nR2.5.1 Rétribution 450000 1000 449000");
  const mo=(n:string,body:string,extra='')=>document(`modification-${n}.pdf`,`FORMULAIRE OBLIGATOIRE\nMODIFICATIONS\nM1. IDENTIFICATION DU FORMULAIRE PRINCIPAL\nPromesse d'achat PA 10001\n${extra}\nM2. MODIFICATIONS AU CONTRAT\n${body}\nM5. Signatures\nMO ${n}`);
  return [pa,af,ar,mo('60006',"M3.1 Le délai d'acceptation mentionné à la clause 14.1 est prolongé jusqu'à 18 h 00 le 3 septembre 2026\nM3.2\nM4. AUTRES MODIFICATIONS"),mo('70007',"M3.1\nM3.2\nM4. AUTRES MODIFICATIONS\nLe délai mentionné à la clause F2.1 de l'annexe AF-40004 est modifié et devrait se lire : 10 jours suivant l'acceptation de la promesse d'achat.",'Autre : AF-40004')];
}
describe('anonymous five-form dossier',()=>{
  it('recognizes five forms independently of file order and names',()=>{
    expect(analyze(dossier()).forms.map(f=>f.number)).toEqual(['10001','40004','30003','60006','70007']);
    expect(analyze(dossier().reverse()).deadlines).toEqual(analyze(dossier()).deadlines);
  });
  it('links PA to both annexes and MO to AF',()=>{
    expect(analyze(dossier()).documentaryState?.links).toEqual(expect.arrayContaining([
      {document:'financement.pdf',targetForm:'PA 10001'}, {document:'retribution.pdf',targetForm:'PA 10001'}, {document:'modification-70007.pdf',targetForm:'AF 40004'}]));
  });
  it('replaces documentary expiry without turning it into acceptance or agenda',()=>{
    const r=analyze(dossier()); expect(r.documentaryState?.acceptanceDeadline).toMatchObject({date:'2026-09-03',time:'18:00'});
    expect(r.acceptanceDateTime).toBeNull(); expect(r.deadlines.some(d=>d.sourceSection==='14.1')).toBe(false);
  });
  it('replaces original five days with one ten-day F2.1 from free M4 text',()=>{
    expect(parseAnnexF(dossier()[1])?.financingDays).toBe(5);
    const deadlines=analyze(dossier()).deadlines.filter(d=>d.sourceSection==='F2.1');
    expect(deadlines).toHaveLength(1); expect(deadlines[0]).toMatchObject({days:10,dueDate:null,relativeRule:{reference:'acceptance',days:10},sourceForm:'70007'});
  });
  it('detects zoning and ignores non-temporal remuneration',()=>{
    const r=analyze(dossier());expect(r.deadlines.find(d=>d.sourceSection==='12.1')).toMatchObject({title:'Condition de zonage',days:30,dueDate:null});
    expect(r.deadlines.some(d=>d.sourceSection?.startsWith('R'))).toBe(false);
  });
  it('retains fixed dates, address and price without acceptance',()=>{
    const r=analyze(dossier()); expect(r.propertyAddress).toBe('123 rue Test, Ville-Test, QC, H0H 0H0');expect(r.finalPrice).toBe(450000);
    expect(r.transactionDates).toMatchObject({deed_of_sale_date:'2026-10-14',occupancy_date:'2026-10-14'});
    expect(r.deadlines.find(d=>d.type==='notary')?.confidence).toBe('high');
  });
  it('recalculates with source civil-day semantics when acceptance is supplied',()=>{
    const docs=dossier(),r=analyze(docs);const details=extractTransactionDetails(docs[0]);
    const proposals=proposalsFromAnalysis({...r,...details,requiresReview:false});
    const recalculated=recalculateDeadlinesFromAcceptanceDate(proposals,'2026-09-05',null);
    expect(recalculated.find(d=>d.source.section==='F2.1')?.dueDate).toBe('2026-09-15');
    expect(recalculated.find(d=>d.source.section==='12.1')?.dueDate).toBe('2026-10-05');
  });
  it('keeps usable documents when another is corrupt',async()=>{
    const r=await analyzeOaciqDocuments([...dossier(),{name:'bad.pdf',data:new Uint8Array([0,1,2])}]);
    expect(r.forms).toHaveLength(5);expect(r.warnings.some(w=>w.includes('bad.pdf'))).toBe(true);
  });
  it('returns recognized annexes when the PA is missing',async()=>{
    const r=await analyzeOaciqDocuments(dossier().slice(1));expect(r.forms).toHaveLength(4);expect(r.mainDocument).toBe('');expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('fails globally only when no PDF is usable',async()=>{
    await expect(analyzeOaciqDocuments([{name:'bad.pdf',data:new Uint8Array([0])}])).rejects.toThrow('Aucun document');
  });
  it('preserves the dossier when an MO contains an impossible date',()=>{
    const docs=dossier();docs[3].pages[0].text=docs[3].pages[0].text.replace('3 septembre 2026','31 février 2026');
    const r=analyze(docs);expect(r.finalPrice).toBe(450000);expect(r.deadlines.find(d=>d.sourceSection==='F2.1')?.days).toBe(10);
    expect(r.warnings.some(w=>w.includes('modification-60006.pdf'))).toBe(true);
  });
  it('recognizes a numbered company in a labelled buyer slot',()=>{
    const doc=prefillPromise();doc.pages[0].words=doc.pages[0].words.map(w=>w.text==='Jean Tremblay' ? {...w,text:'1234 5678 Québec Inc.'} : w);
    expect(extractTransactionDetails(doc).buyers[0].fullName).toBe('1234 5678 Québec Inc.');
  });
});
