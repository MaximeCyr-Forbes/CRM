import {describe,it,expect} from 'vitest';
import {captureTableText,parseCaptureText,type CaptureWord} from './direct-client-capture';
import {detectScreenshotFormat,parseScreenshot} from './direct-client-capture-formats';

// Same full-screen layout as the Maurice report; client coordinates anonymized.
const table=`Date de demande | Nom | Téléphone | Courriel | Visite demandée
22 octobre | Marie Exemple | 514-555-0101 | marie@example.test | 24 octobre, 11 h
3 novembre | Simon Démo | 514-555-0102 | simon@example.test | 4 novembre, 14 h`;
const full=`Question : toutes les demandes directes pour cette propriété
Réfléchi pendant 1 minute
Demandes directes — 100 rue Exemple
2 demandes directes retrouvées
Vérification depuis le 20 octobre 2026.
${table}
Suivis retrouvés
Marie Exemple
Demande de visite reçue directement par Centris le 22 octobre.
Simon Démo
Demande transmise par une courtière le 3 novembre.
Copier Partager`;
const today='2026-11-09';
describe('flexible ChatGPT capture columns',()=>{
 it.each([
  ['Nom | Téléphone | Courriel | Provenance','Personne Test | 514-555-0101 | qa@example.test | Centris'],
  ['Nom | Téléphone | Courriel','Personne Test | 514-555-0101 | qa@example.test'],
  ['Nom | Courriel','Personne Test | qa@example.test'],
  ['Nom | Téléphone','Personne Test | 514-555-0101'],
  ['Nom | Courriel | Téléphone','Personne Test | qa@example.test | 514-555-0101'],
  ['Date | Nom | Courriel | Nature','22 octobre | Personne Test | qa@example.test | Visite'],
  ['Source | Contact | E-mail | Cellulaire | Reçue le | RDV','Centris | Personne Test | qa@example.test | 514-555-0101 | 22 octobre | Demain'],
  ['Date de réception | Client | Tel | Message','22 octobre | Personne Test | 514-555-0101 | Question'],
  ['Nom | Téléphone | Courriel | Source | Date','Personne Test | 514-555-0101 | qa@example.test | Centris | 22 octobre'],
  ['Nom | Téléphone | Courriel | Nature de la demande','Personne Test | 514-555-0101 | qa@example.test | Visite'],
 ])('maps %s without positional assumptions',(header,row)=>{
  const text=header+'\n'+row;expect(detectScreenshotFormat(text)).toBe('ChatGPT');
  const r=parseScreenshot(text,[],today);expect(r.clients).toHaveLength(1);expect(r.clients[0].name).toBe('Personne Test');
  if(header.toLowerCase().match(/courriel|e-mail/))expect(r.clients[0].email).toBe('qa@example.test');
  if(header.match(/Téléphone|Cellulaire|Tel/))expect(r.clients[0].phone).toBe('514-555-0101');
 });
 it('extracts the full report without turning follow-ups or visit dates into request dates',()=>{
  const r=parseScreenshot(full,[],today);expect(r.format).toBe('ChatGPT');expect(r.clients).toHaveLength(2);
  expect(r.clients[0]).toMatchObject({name:'Marie Exemple',phone:'514-555-0101',email:'marie@example.test',source:null,request_date:'2026-10-22',request_note:'Visite demandée : 24 octobre, 11 h'});
  expect(r.clients[1]).toMatchObject({name:'Simon Démo',request_date:'2026-11-03',request_note:'Visite demandée : 4 novembre, 14 h'});
  expect(r.clients.every(c=>c.warnings.some(w=>w.includes('Année supposée : 2026')))).toBe(true);
 });
 it('supports Markdown pipes, separators, bold headers and extra columns',()=>{
  const r=parseScreenshot('| **Nom** | Courriel | Autre |\n| --- | --- | --- |\n| Personne Test | qa@example.test | commentaire |',[],today);
  expect(r.clients[0]).toMatchObject({name:'Personne Test',email:'qa@example.test',source:null});
 });
 it.each(['Nom Téléphone Courriel','Nom\nTéléphone\nCourriel\nBoîte de réception\nqa@example.test','Nom | Courriel\nTexte | sans coordonnées','Photo de Nom Téléphone Courriel','Nom | Téléphone | Courriel'])('rejects labels without structured coordinates: %s',text=>{
  expect(detectScreenshotFormat(text)).toBe('unknown');expect(()=>parseScreenshot(text,[],today)).toThrow();
 });
 it('preserves the 100-row limit',()=>expect(()=>parseScreenshot('Nom | Courriel\n'+Array.from({length:101},(_,i)=>`Personne ${i} | qa${i}@example.test`).join('\n'),[],today)).toThrow('maximum 100'));
 it('reconstructs split OCR header words including the column before Name and excludes sidebar/follow-ups',()=>{
  const words:CaptureWord[]=[];
  const add=(text:string,x:number,y:number,width=60)=>words.push({text,x,y,width,height:18,confidence:95});
  add('Navigation',10,98);add('Demande directe',250,50);
  [['Date',250],['de',290],['demande',315],['Nom',400],['Téléphone',530],['Courriel',650],['Visite',900],['demandée',950]].forEach(([text,x])=>add(String(text),Number(x),100));
  [['22 octobre','Marie Exemple','514-555-0101','marie@example.test','24 octobre, 11 h'],['3 novembre','Simon Démo','514-555-0102','simon@example.test','4 novembre, 14 h']].forEach((row,i)=>row.forEach((text,j)=>add(text,[250,400,530,650,900][j],150+i*40)));
  add('Suivis retrouvés',250,250);add('Marie Exemple',250,290);add('Centris',650,290);
  const text=captureTableText(words.reverse());expect(text).toContain('Date de demande | Nom | Téléphone | Courriel | Visite demandée');expect(text).not.toContain('Navigation');expect(text).not.toContain('Suivis');
  const r=parseScreenshot('',words,today);expect(r.clients).toHaveLength(2);expect(r.clients[0].request_date).toBe('2026-10-22');expect(r.clients[1].email).toBe('simon@example.test');
 });
 it('keeps damaged coordinates visible for correction without bypassing validation',()=>{
  const r=parseCaptureText('Nom | Courriel\nPersonne Test | broken',today);expect(r.clients[0].warnings).toContain('Courriel invalide.');
 });
 it('keeps a separate spatial client when its leading optional date cell is empty',()=>{
  const words:CaptureWord[]=[];
  [['Date','Nom','Courriel'],['22 octobre','Personne Une','one@example.test'],['','Personne Deux','two@example.test']].forEach((row,y)=>row.forEach((text,x)=>{if(text)words.push({text,x:100+x*250,y:y*45,width:100,height:18,confidence:95});}));
  const r=parseScreenshot('',words,today);expect(r.clients).toHaveLength(2);expect(r.clients[1]).toMatchObject({name:'Personne Deux',request_date:null,email:'two@example.test'});
 });
});
