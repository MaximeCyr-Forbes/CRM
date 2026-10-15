import {describe,it,expect} from 'vitest';
import {captureDates,captureTableText,deduplicateCapture,parseCaptureText, type CaptureWord} from './direct-client-capture';
const table=`Texte introductif sans client
LISTE DES CLIENTS POTENTIELS
Nom | Téléphone | Courriel | Provenance
Émilie Démo | Non fourni | emilie.demo @ exemple.test, | Centris
Jean-Paul Exemple | (514) 555-0101 | jean_paul@exemple.test | RE/MAX
DÉTAILS DES DEMANDES
Client | Date | Nature de la demande
EMILIE DEMO | 30 septembre et 2 octobre | Souhaite visiter, 2 demandes
Jean-Paul Exemple | 12 octobre 2026 | Questions sur la propriété
Conclusion : fin de la liste`;
describe('capture tables',()=>{
 it('merges tables by normalized name and keeps dates/notes',()=>{const r=parseCaptureText(table,'2026-10-15');expect(r.clients).toHaveLength(2);expect(r.clients[0]).toMatchObject({name:'Émilie Démo',phone:null,email:'emilie.demo@exemple.test',source:'Centris',request_date:'2026-10-02'});expect(r.clients[0].request_note).toContain('2 demandes');expect(r.clients[0].request_note).toContain('30 septembre');expect(r.clients[1].request_date).toBe('2026-10-12');});
 it('works with only the first table',()=>expect(parseCaptureText(table.split('DÉTAILS')[0],'2026-10-15').clients[0].request_date).toBeNull());
 it('warns about details without coordinates',()=>expect(parseCaptureText('Client | Date | Nature de la demande\nPersonne Test | 1 octobre | Visite','2026-10-15').clients[0].warnings.length).toBeGreaterThan(0));
 it('keeps invalid email visible for correction',()=>expect(parseCaptureText('Nom | Téléphone | Courriel | Provenance\nPersonne Test | — | incorrect | Autre','2026-10-15').clients[0].warnings).toContain('Courriel invalide.'));
 it('flags syntactically valid OCR confusions',()=>expect(parseCaptureText('Nom | Téléphone | Courriel | Provenance\nPersonne Test | — | qa@hotrnail.com | Autre','2026-10-15').clients[0].warnings.join(' ')).toContain('mal lu'));
 it('merges exact duplicate names and matching coordinates',()=>{const r=parseCaptureText(table,'2026-10-15');expect(deduplicateCapture([...r.clients,r.clients[0]])).toHaveLength(2);});
 it('keeps different people sharing a phone with a warning',()=>{const r=parseCaptureText('Nom | Téléphone | Courriel | Provenance\nPersonne Un | 514-555-0101 | — | Centris\nPersonne Deux | (514) 555-0101 | — | Centris','2026-10-15');expect(r.clients).toHaveLength(2);expect(r.clients[1].warnings.join(' ')).toContain('doublon');});
 it.each(['Non fourni','Pas fourni','N/A','—'])('normalizes %s',v=>expect(parseCaptureText(`Nom | Téléphone | Courriel | Provenance\nPersonne Test | ${v} | — | Autre`,'2026-10-15').clients[0].phone).toBeNull());
 it('warns instead of assuming a year across year boundaries',()=>expect(captureDates('30 décembre et 2 janvier','2026-01-15').warnings.join(' ')).toContain('future'));
 it('rejects invalid calendar dates',()=>expect(captureDates('31 février 2026','2026-10-15').date).toBeNull());
 it('rejects unrelated images/text',()=>expect(()=>parseCaptureText('Une montagne et un arbre','2026-10-15')).toThrow());
 it('reconstructs spatial columns regardless of OCR block order',()=>{const words:CaptureWord[]=[];[['Nom','Téléphone','Courriel','Provenance'],['Personne Test','514-555-0101','qa@exemple.test','Centris']].forEach((row,y)=>row.forEach((text,x)=>words.push({text,x:x*300,y:y*50,width:100,height:20,confidence:98})));expect(parseCaptureText(captureTableText(words.reverse()),'2026-10-15').clients[0].email).toBe('qa@exemple.test');});
});

it('isolates full-screen tables from sidebar text, footnotes and the composer; joins wrapped names and dates',()=>{
 const words:CaptureWord[]=[];
 const row=(y:number,cells:string[],xs:number[],height=16)=>cells.forEach((text,i)=>{if(text)words.push({text,x:xs[i],y,width:70,height,confidence:95});});
 const xs=[900,1120,1300,1600];
 row(95,['Navigation'],[20],30);
 row(100,['Nom','Téléphone','Courriel','Provenance'],xs);
 row(160,['Alex Exemple-Parent','Non fourni','qa@example.invalid','Centris'],xs);
 row(220,['Une petite note explicative','aucun client supplémentaire'],[900,1300],8);
 row(300,['Client','Date','Nature'],[900,1120,1400]);
 row(360,['Alex Exemple-','30 septembre et 2','Souhaite visiter, 2 demandes'],[900,1120,1400]);
 row(392,['Parent','octobre',''],[900,1120,1400]);
 row(490,['Composer','Texte sans client','Bouton'],[900,1120,1400]);
 const parsed=parseCaptureText(captureTableText(words),'2026-10-15');
 expect(parsed.clients).toHaveLength(1);
 expect(parsed.clients[0]).toMatchObject({name:'Alex Exemple-Parent',phone:null,request_date:'2026-10-02'});
 expect(parsed.clients[0].request_note).toContain('30 septembre et 2 octobre');
 expect(parsed.clients[0].request_note).not.toContain('Composer');
});
it('flags a plausible OCR confusion in an email domain without silently replacing it',()=>{
 const result=parseCaptureText('Nom | Téléphone | Courriel | Provenance\nAlex Exemple | Non fourni | qa@outiook.com | Centris','2026-10-15');
 expect(result.clients[0].email).toBe('qa@outiook.com');expect(result.clients[0].warnings.join(' ')).toContain('Courriel potentiellement mal lu');
});
