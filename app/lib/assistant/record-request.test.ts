import {expect,it} from 'vitest';
import {parseRecordRequest,recordPath} from './record-request';
import {classify} from './conversation';
it.each([
 ["Peux-tu m'ouvrir la fiche contact de Élodie D’Arcy ?",'contacts',"Élodie D'Arcy",true],
 ['Ouvre-moi Jean-Pierre Du Lac dans Contacts.','contacts','Jean-Pierre Du Lac',true],
 ['Je veux consulter la fiche de Élodie Exemple.','contacts','Élodie Exemple',true],
 ['Ouvre la fiche de Elodie Exemple.','contacts','Elodie Exemple',true],
 ['Trouve le Contact de Claude.','contacts','Claude',false],
 ['Pourrais-tu ouvrir le Listing du 123 Exemple ?','listings','123 Exemple',true],
 ['Accède à la Transaction du 456 Exemple.','transactions','456 Exemple',true],
 ['Amène-moi à la fiche client de Marie France.','contacts','Marie France',true],
 ['Montre-moi la fiche contact de Jean  De La Rue.','contacts','Jean De La Rue',true],
 ['Trouve Élodie Exemple.',undefined,'Élodie Exemple',false],
 ['Trouve le Contact de Jean Ouvrard.','contacts','Jean Ouvrard',false],
])('structured extraction: %s',(q,section,query,open)=>expect(parseRecordRequest(q as string)).toEqual({section,query,open}));
it('HOW_TO and writes retain priority',()=>{expect(classify('Comment ouvrir une fiche Contact ?').mode).toBe('HOW_TO');expect(classify('Crée un nouveau Contact.').mode).toBe('WRITE_REQUEST');});
it.each(['https://evil.test','//evil.test','javascript:alert(1)','/contacts/not-valid','/contacts/11111111-1111-4111-8111-111111111111?redirect=evil'])('rejects unverified route %s',url=>expect(recordPath(url)).toBe(false));
