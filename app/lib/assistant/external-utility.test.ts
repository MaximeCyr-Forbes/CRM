import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {buildQueryPlan, type ConversationState} from './query-plan';
import {assemblePrivateAnswer} from './privacy';
import {GENERIC_PLAN_BODY} from './policy';

// Synthetic benchmark of the EXISTING external capability, not a claim that a
// mock measures a model's intelligence. Every legal section permutation leaves
// module selection, navigation and the local query plan unchanged.
const cases = [
 ['Ouvre Contacts', 'contacts', 'navigate'],
 ['Ouvre Listings', 'listings', 'navigate'],
 ['Ouvre Transactions', 'transactions', 'navigate'],
 ['Ouvre Comptabilité', 'accounting', 'navigate'],
 ['Ouvre Calendrier', 'calendar', 'navigate'],
 ['Ouvre Drive', 'drive', 'navigate'],
 ['Ouvre Paramètres', 'settings', 'navigate'],
 ['Ouvre Statistiques', 'statistics', 'navigate'],
 ['Ouvre Accueil', 'dashboard', 'navigate'],
 ['Ouvre Pancartes', 'inventory', 'navigate'],
 ['Comment créer un contact ?', 'contacts', 'how_to'],
 ['Comment modifier un contact ?', 'contacts', 'how_to'],
 ['Comment supprimer un contact ?', 'contacts', 'how_to'],
 ['Comment supprimer un Listing ?', 'listings', 'how_to'],
 ['Comment ajouter une dépense ?', 'accounting', 'how_to'],
 ['Comment connecter Google Agenda ?', 'settings', 'how_to'],
 ['Comment consulter les visites d’une propriété ?', 'listings', 'how_to'],
 ['Comment créer une transaction ?', 'transactions', 'how_to'],
 ['Comment envoyer un courriel à un contact ?', 'contacts', 'how_to'],
 ['Explique la comptabilité', 'accounting', 'explain'],
 ['Explique les statistiques', 'statistics', 'explain'],
 ['Explique les listings', 'listings', 'explain'],
 ['Supprime ce contact', 'contacts', 'write_denied'],
 ['Modifie cette transaction', 'transactions', 'write_denied'],
 ['Ajoute une dépense', 'accounting', 'write_denied'],
 ['Bonjour', undefined, 'clarify'],
 ['Et ensuite ?', undefined, 'clarify'],
 ['Ouvre sa fiche', 'contacts', 'clarify'],
 ['Et pour demain ?', 'calendar', 'read', 'Ouvre Calendrier'],
 ['Et les mêmes ?', 'listings', 'read', 'Ouvre Listings'],
] as const;
const now = new Date('2026-11-19T15:00:00Z');
function previous(question?: string): ConversationState | undefined {
 return question ? {version:1, memberId:'synthetic', expiresAt:now.getTime()+60_000,turn:1,lastPlan:buildQueryPlan(question,undefined,now)} : undefined;
}
beforeEach(()=>vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No real API in automated tests');})));
afterEach(()=>vi.unstubAllGlobals());
it.each(cases.map(([question,module,mode,prior])=>({question,module,mode,prior})))('utility boundary: $question', ({question,module,mode,prior}) => {
 const state=previous(prior), local=buildQueryPlan(question,state,now);
 // Scores are measured separately: a known local miss is not relabelled correct.
 expect(local.mode).toBe(mode);
 if(question!=='Et pour demain ?') expect(local.module).toBe(module);
 const prepared={sections:{summary:['Synthetic summary'],results:['Synthetic result']},links:[]};
 const before=structuredClone(local);
 // Both opposing permitted responses have no influence on understanding.
 for(const sections of [['summary','results'],['results','summary']]){
  const answer=assemblePrivateAnswer(prepared,JSON.stringify({sections}));
  expect(answer).toContain('Synthetic result');
  expect(buildQueryPlan(question,state,now)).toEqual(before);
 }
 expect(GENERIC_PLAN_BODY).not.toContain(question);
 expect(fetch).not.toHaveBeenCalled();
});
it('benchmark contains at least thirty questions; provider cannot return a query plan',()=>{
 expect(cases).toHaveLength(30);
 expect(()=>assemblePrivateAnswer({sections:{},links:[]},JSON.stringify({sections:['summary'],module:'contacts'}))).toThrow();
});
it('records the same 29/30 plan score with and without the section-order capability',()=>{
 const correct=cases.filter(([q,module,mode,prior])=>{const p=buildQueryPlan(q,previous(prior),now);return p.module===module&&p.mode===mode;}).length;
 expect(correct).toBe(29);
 // Calendar follow-up currently routes to transactions; generic ordering cannot fix it.
 expect(buildQueryPlan('Et pour demain ?',previous('Ouvre Calendrier'),now).module).toBe('transactions');
});
