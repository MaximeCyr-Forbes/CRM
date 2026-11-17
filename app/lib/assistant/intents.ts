/** Extensible local grammar: concepts, ranked intentions and entity slots.
 * Nothing from this parser is sent to the external model. */
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const vocabulary={sellers:['vendeur','vendeurs','proprietaire','proprietaires'],listings:['listing','listings','propriete','proprietes','inscription','inscriptions','maison'],transactions:['transaction','transactions','dossier','dossiers'],contacts:['client','clients','contact','contacts'],summary:['resume','resumer','recapitulatif','synthese','bilan'],conditions:['condition','conditions','financement','inspection'],deadlines:['echeance','echeances','delai','delais'],urgent:['urgent','urgents','urgente','urgentes','priorite','priorites'],followups:['rappeler','rappel','rappels','relancer','relance','relances','suivi','suivis'],inventory:['stock','stocks','inventaire','pancarte','pancartes','bac'],search:['trouve','trouver','cherche','chercher','recherche','retrouve'],relation:['lie','lies','liee','liees','associe','associes','associee','associees'],coordinates:['telephone','courriel','email','coordonnees','note','notes','document','documents','signature'],write:['supprime','supprimer','efface','effacer','modifie','modifier','cree','creer','envoie','envoyer','finalise','finaliser','retourne']} as const;
type Concept=keyof typeof vocabulary;
export type Intent=Exclude<Concept,'contacts'>|'unknown'|'accounting'|'mortgage';
const accountingWords=new Set('comptabilite depense depenses fournisseur fournisseurs montant montants paiement paiements facture factures paye payee payees payes impaye impayee impayees impayes'.split(' '));
const queryStops=new Set('dans chez dernier derniere derniers dernieres recent recente recents recentes avons-nous avons nous une disponibles disponible reste restent en retard maintenant donc est-ce que a-t-on montre-moi trouve-moi'.split(' '));
const rules:{intent:Intent;all:Concept[];weight:number}[]=[
 {intent:'write',all:['write'],weight:100},{intent:'sellers',all:['sellers'],weight:90},{intent:'coordinates',all:['coordinates'],weight:85},{intent:'summary',all:['summary'],weight:80},{intent:'relation',all:['listings','relation'],weight:78},{intent:'followups',all:['followups'],weight:75},{intent:'urgent',all:['urgent'],weight:74},{intent:'conditions',all:['conditions'],weight:70},{intent:'deadlines',all:['deadlines'],weight:69},{intent:'inventory',all:['inventory'],weight:65},{intent:'search',all:['search'],weight:60},{intent:'listings',all:['listings'],weight:50},{intent:'transactions',all:['transactions'],weight:49},
];
const stop=new Set('qui que quoi quel quels quelle quelles sont est les le la un une des de du au aux a pour sur ce cet cette ces moi stp svp sil s il te plait peux peux-tu tu me donner donne montre affiche et actif actifs active actives appartiennent appartient courtier mes mon ma combien dois dois-je je ont lever plus son sa ses'.split(' '));
export function recognizeIntent(question:string){
 const tokens=Array.from(question.matchAll(/[\p{L}\p{N}@._+-]+/gu),m=>({raw:m[0].replace(/^[.]+|[.]+$/g,''),value:normalize(m[0]).replace(/^[.]+|[.]+$/g,'')}));
 const concepts=new Set<Concept>();for(const [concept,words] of Object.entries(vocabulary))if(tokens.some(t=>(words as readonly string[]).includes(t.value)))concepts.add(concept as Concept);
 const accounting=tokens.some(t=>accountingWords.has(t.value));
 const mortgage=tokens.some(t=>['hypothecaire','hypothecaires'].includes(t.value));
 const intent:Intent=concepts.has('write')||/^(paye|payer|marque|marquer|ajoute|ajouter)\b/.test(normalize(question).trim())?'write':mortgage?'mortgage':accounting?'accounting':rules.filter(r=>r.all.every(c=>concepts.has(c))).sort((a,b)=>b.weight-a.weight)[0]?.intent??(concepts.has('contacts')?'search':'unknown');
 const broker=tokens.find((t,i)=>['maxime','france','sandrine'].includes(t.value)&&['de','pour','courtier','a'].includes(tokens[i-1]?.value))?.value;
 const vocab=new Set<string>(Object.values(vocabulary).flat());
 const entity=tokens.filter(t=>!stop.has(t.value)&&!queryStops.has(t.value)&&!accountingWords.has(t.value)&&!vocab.has(t.value)&&t.value!==broker).map(t=>t.raw).join(' ').replace(/[.?!]+$/,'').trim();
 const has=(words:string[])=>tokens.some(t=>words.includes(t.value));
 const unpaid=has(['impaye','impayee','impayees','impayes'])||normalize(question).includes('non pay');
 const accountingMode=unpaid?'expenses':has(['facture','factures'])?'invoice':has(['paiement','paiements'])?'payment':has(['paye','payee','payes','payees'])&&has(['combien'])?'paid_total':has(['dernier','derniere','recent','recente'])?'latest':'expenses';
 return {intent,entity,broker,accountingMode,unpaid,mine:tokens.some(t=>t.value.split('-').some(p=>['mes','mon','ma','je'].includes(p))),active:tokens.some(t=>['actif','actifs','active','actives'].includes(t.value)),count:tokens.some(t=>t.value==='combien'),concepts};
}
