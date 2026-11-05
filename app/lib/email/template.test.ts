import {expect,it} from 'vitest';
import {renderEmailRecipient,resolveEmailTemplate} from './template';
import {validateGmailMessage} from './validation';
it('preserves hyphenated names and all shared variables',()=>{
 const rendered=renderEmailRecipient('{{fullName}}','{{firstName}} | {{lastName}} | {{email}} | {{phone}}',{firstName:' Marie-Claude ',lastName:' Exemple ',email:'qa@example.test',phone:'5145550100'});
 expect(rendered).toMatchObject({subject:'Marie-Claude Exemple',message:'Marie-Claude | Exemple | qa@example.test | 5145550100',blockingReasons:[]});
});
it.each(['{{unknown}}','{{constructor}}','{{toString}}','{{phone}}'])('does not silently remove %s',token=>{expect(resolveEmailTemplate(token,{})).toBe(token);expect(renderEmailRecipient('Sujet',token,{email:'qa@example.test'}).blockingReasons).toContain('Variable non résolue.');});
it('blocks raw variables at the last shared Gmail validation boundary',()=>{expect(()=>validateGmailMessage({to:'qa@example.test',subject:'Bonjour {{firstName}}',message:'Bonjour'})).toThrow('Variable non résolue.');});
it('keeps templates without variables unchanged',()=>{expect(renderEmailRecipient('Suivi','Bonjour,',{email:'qa@example.test'})).toMatchObject({subject:'Suivi',message:'Bonjour,',blockingReasons:[]});});
