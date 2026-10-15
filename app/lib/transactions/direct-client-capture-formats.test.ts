import {describe,it,expect} from 'vitest';
import {capturePropertyMatch,detectScreenshotFormat,parseCentrisLead,parseScreenshot,captureLeadText} from './direct-client-capture-formats';
import {deduplicateCapture,captureClientWarnings,type CaptureWord} from './direct-client-capture';
const today='2026-10-15';
const lead=`Centris.ca
Bonjour Courtier Exemple,
Jean Exemple vous a envoyé ce message à partir du formulaire de contact de Centris.ca.
Type
Demande d'information
Nom
Jean Exemple
Courriel
jean@example.test
Téléphone
(514) 555-0101
Message
Bonjour, je souhaite des renseignements concernant l'inscription située
au 123, Rue des Tests (#12345678).
Et connaître la date possible pour visiter.
Voir la fiche courtier
Répondre
Transférer`;
const table='Nom | Téléphone | Courriel | Provenance\nJean Exemple | 514-555-0101 | jean@example.test | Centris';
describe('automatic screenshot formats',()=>{
 it.each([[lead,'Centris'],[table,'ChatGPT'],['centris.ca logo only','unknown'],['Bonjour et merci','unknown']])('detects multiple signals', (text,format)=>expect(detectScreenshotFormat(text)).toBe(format));
 it('works without logo and prefers the structured name over broker/introduction',()=>{const r=parseScreenshot(lead.replace('Centris.ca\n','').replace('Jean Exemple vous','Autre Nom vous'),[],today);expect(r.clients).toHaveLength(1);expect(r.clients[0].name).toBe('Jean Exemple');});
 it('extracts all fields and complete multiline message without footer or fabricated date',()=>{const c=parseScreenshot(lead,[],today).clients[0];expect(c).toMatchObject({name:'Jean Exemple',email:'jean@example.test',phone:'(514) 555-0101',source:'Centris',request_date:null,properties:[{address:'123, Rue des Tests',listingNumber:'12345678'}]});expect(c.request_note).toBe("Demande d'information — Bonjour, je souhaite des renseignements concernant l'inscription située au 123, Rue des Tests (#12345678). Et connaître la date possible pour visiter.");expect(c.warnings).toEqual([]);});
 it.each(['Courriel\njean@example.test\n','Téléphone\n(514) 555-0101\n'])('supports absent optional coordinates',omit=>{const c=parseScreenshot(lead.replace(omit,''),[],today).clients[0];expect(omit.startsWith('Courriel')?c.email:c.phone).toBeNull();});
 it('uses introduction only when structured name absent',()=>expect(parseScreenshot(lead.replace('Nom\nJean Exemple\n',''),[],today).clients[0].name).toBe('Jean Exemple'));
 it('ignores dates in the message, but accepts explicit reception date with year',()=>{expect(parseCentrisLead(lead.replace('Message\n','Date de réception\n12 octobre 2026\nMessage\n'),today).clients[0].request_date).toBe('2026-10-12');expect(parseCentrisLead(lead.replace('Bonjour, je','Le 12 octobre 2026, je'),today).clients[0].request_date).toBeNull();expect(parseCentrisLead(lead.replace('Message\n','Date\n12 octobre\nMessage\n'),today).clients[0].request_date).toBeNull();});
 it('flags damaged email and incomplete phone without guessing',()=>{const c=parseCentrisLead(lead.replace('example.test','grnail.com').replace('(514) 555-0101','514-555-010'),today).clients[0];expect(c.email).toBe('jean@grnail.com');expect(c.warnings).toHaveLength(2);});
 it('flags explicit OCR glyph cleanup for human review',()=>{const c=parseCentrisLead(lead.replace('jean@','jean(@'),today).clients[0];expect(c.email).toBe('jean@example.test');expect(c.warnings.some(w=>w.includes('vérifiez le courriel'))).toBe(true);});
 it('rejects unknown screenshots instead of fabricating clients',()=>expect(()=>parseScreenshot('Photo et interface Gmail',[],today)).toThrow('Format de capture non reconnu'));
 it('retains ChatGPT parsing through the common entry point',()=>expect(parseScreenshot(table,[],today)).toMatchObject({format:'ChatGPT',clients:[{name:'Jean Exemple',email:'jean@example.test'}]}));
 it('combines cross-format duplicates, messages and most recent date',()=>{const c=parseCentrisLead(lead,today).clients[0];const t=parseScreenshot(table,[],today).clients[0];c.request_date='2026-10-12';t.request_date='2026-10-14';t.request_note='Souhaite visiter';t.source='RE/MAX';const result=deduplicateCapture([c,t,c]);expect(result).toHaveLength(1);expect(result[0].request_date).toBe('2026-10-14');expect(result[0].request_note).toContain('Souhaite visiter');expect(result[0].request_note).toContain('2026-10-12');expect(result[0].properties).toHaveLength(1);});
 it('preserves two different people sharing a family email for review',()=>{const c=parseCentrisLead(lead,today).clients[0];expect(deduplicateCapture([c,{...c,name:'Autre Personne'}])).toHaveLength(2);});
 it.each(['514-555-0101','(514) 555-0101','514 555 0101','+1 514 555 0101'])('accepts complete phone formats',phone=>expect(captureClientWarnings({...parseCentrisLead(lead,today).clients[0],phone})).toEqual([]));
 it('cuts OCR text at the photo gap and excludes Gmail sidebar',()=>{const word=(text:string,x:number,y:number):CaptureWord=>({text,x,y,width:80,height:20,confidence:95});const text=captureLeadText([word('Boîte de réception',0,20),word('Centris.ca',400,20),word('Nom',400,60),word('Jean Exemple',400,90),word('Courriel',400,130),word('jean@example.test',400,160),word('Message',400,200),word('Une question',400,230),word('texte dans photo',400,500)],'');expect(text).toContain('Une question');expect(text).not.toContain('photo');expect(text).not.toContain('Boîte');});
});
describe('property context',()=>{
 it.each([
  [{listingNumber:'12345678'},{listingNumber:'12345678'},'match'],
  [{listingNumber:'12345678'},{listingNumber:'87654321'},'mismatch'],
  [{address:'123, Rue des Tests'},{address:'123 rue des Tests, Montréal'},'match'],
  [{address:'123 Rue des Tests'},{address:'456 Rue des Tests'},'mismatch'],
  [{address:'123 Rue des Tests'},{address:'123 Rue Exemple'},'mismatch'],
  [{address:'123 Rue Main'},{address:'123 Rue Maine'},'mismatch'],
  [{address:null},{address:'123 rue Test'},'unknown'],
  [{address:'Rue des Tests'},{address:'123 rue Tests'},'unknown'],
 ])('compares only available property evidence', (a,b,result)=>expect(capturePropertyMatch(a,b)).toBe(result));
});
