import type { CRMMember } from '../auth/identity';
import type { ChatInput } from './policy';
import type { VerifiedLink } from './tools';

type Read = (name: string, args: Record<string, unknown>) => Promise<{data: unknown;links: VerifiedLink[]}>;
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.slice(0,5).map(row) : [];
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const statuses = new Set(['active','preparation','coming_soon','offer_received','conditional','sold','rented','new','pa_preparation','pa_sent','pa_accepted','inspection','financing','other_conditions','conditions_met','notary','completed','cancelled','on_market','negotiation','pending','done']);
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
function project(value: Row, index: number, kind: string, prices: boolean) {
  // Closed vocabulary only: even a poisoned status/label cannot carry instructions or personal data.
  return {
    label: `${kind} ${index+1}`,
    status: statuses.has(String(value.status)) ? value.status : undefined,
    purpose: ['sale','rental','purchase'].includes(String(value.purpose || value.type)) ? value.purpose || value.type : undefined,
    notaryDate: date(value.notaryDate || value.notary_date),
    dueDate: date(value.dueDate || value.due_date || value.date),
    completed: typeof value.completed === 'boolean' ? value.completed : undefined,
    ...(prices ? {askingPrice: amount(value.askingPrice ?? value.asking_price),price:amount(value.price),monthlyRent:amount(value.monthlyRent ?? value.monthly_rent)} : {}),
  };
}
export type PrivateContext = {task: string;data: unknown;links: VerifiedLink[];localAnswer?: string};

/** Raw questions, CRM text, UUIDs and conversation history never enter provider input.
 * Unsupported questions fail closed instead of relying on a PII-detection regex.
 */
export async function preparePrivateContext(input: ChatInput, member: CRMMember, read: Read, now = new Date()): Promise<PrivateContext> {
  const q=norm(input.question), links:VerifiedLink[]=[];
  let reads=0;
  const run=async(name:string,args:Record<string,unknown>)=>{
    if(++reads>4)throw new Error('ASSISTANT_TOOL_LIMIT');
    const result=await read(name,args);links.push(...result.links);return row(result.data);
  };
  const done=(task:string,data:unknown,localAnswer?:string):PrivateContext=>({task,data,localAnswer,
    links:[...new Map(links.map(link=>[link.href,link])).values()].slice(0,10)});
  if(/\b(supprim|effac|modifi|creer|cree|envoi|envoy|retourne|finalis)/.test(q))
    return done('',null,'Je peux uniquement consulter les dossiers. Aucune modification ou action externe n’a été effectuée.');
  const explicit=q.match(/(?:de|pour|courtier)\s+(maxime|france|sandrine)\b/)?.[1];
  if(explicit && !member.brokers.includes(explicit as CRMMember['broker'])) throw new Error('ASSISTANT_FORBIDDEN');
  const brokers=explicit?[explicit]:/\b(mes|mon|ma)\b/.test(q)?[member.broker]:member.brokers;
  const prices=/\b(prix|loyer|valeur|montant)\b/.test(q);
  const coordinates=/\b(telephone|courriel|email|coordonnees|signature|notes?|documents?)\b/.test(q);
  if(coordinates) {
    if(input.context){const [,section,id]=input.context.split('/');const type=section==='contacts'?'contact':section==='listings'?'listing':'transaction';await run(`crm_get_${type}`,{[`${type}_id`]:id});}
    return done('',null,'Pour les coordonnées, notes et documents, consultez directement la fiche CRM autorisée. Ces renseignements ne sont pas transmis au modèle.');
  }
  if(/\b(listings?|proprietes?|inscriptions?)\b/.test(q) && /\b(acti|combien)/.test(q)) {
    let total=0;const records:Row[]=[];
    for(const broker of brokers){
      const result=await run('crm_get_active_broker_listings',{broker});
      if(typeof result.total!=='number' || !Number.isSafeInteger(result.total) || result.total<0)throw new Error('ASSISTANT_INVALID_COUNT');
      total+=result.total;records.push(...list(result.listings));
    }
    if(/\bcombien\b/.test(q))return done('Indiquer uniquement le nombre de Listings actifs dans le périmètre autorisé.',{total});
    return done('Présenter les Listings actifs par leurs étiquettes; les liens CRM sont affichés séparément.',{total,records:records.slice(0,5).map((r,i)=>project(r,i,'Listing',prices)),truncated:total>5});
  }
  if(/\btransactions?\b/.test(q)&&/\bacti/.test(q)) {
    const records:Row[]=[];let truncated=false;
    for(const broker of brokers){const result=await run('crm_get_active_broker_transactions',{broker});records.push(...list(result.transactions));truncated ||= result.truncated===true;}
    return done('Présenter les Transactions actives sans prétendre que cet extrait est exhaustif.',{records:records.slice(0,5).map((r,i)=>project(r,i,'Transaction',prices)),truncated:truncated||records.length>5});
  }
  if(/\b(echeances?|conditions?|suivis?)\b/.test(q)) {
    const today=new Intl.DateTimeFormat('fr-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const add=(n:number)=>{const d=new Date(`${today}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
    const from=/demain/.test(q)?add(1):today,to=/demain/.test(q)?add(1):/aujourd/.test(q)?today:add(7);
    const result=await run('crm_get_upcoming_deadlines',{from,to,limit:5});
    return done('Présenter les prochaines échéances dans la plage demandée. Les intitulés privés sont omis.',{from,to,records:list(result.data).map((r,i)=>project(r,i,'Échéance',false)),truncated:result.nextPage!=null});
  }
  if(/\b(pancartes?|inventaire|stock|bac)\b/.test(q)) {
    const result=await run('crm_get_sign_inventory',{limit:5});
    return done('Présenter les quantités disponibles sans inventer de total pour les lignes absentes.',{records:list(result.data).map((r,i)=>({label:`Matériel ${i+1}`,available:amount(r.available),total:amount(r.total),used:amount(r.used)})),truncated:result.nextPage!=null});
  }
  if(/references? hypothecaires?/.test(q)) {
    const records:Row[]=[];let truncated=false;
    for(const broker of brokers){const result=await run('crm_get_mortgage_referrals',{broker,status:'upcoming',limit:5});records.push(...list(result.data));truncated ||= result.nextPage!=null;}
    return done('Présenter les références à venir sous leurs étiquettes, sans coordonnées ni montant personnel.',{records:records.slice(0,5).map((_r,i)=>({label:`Référence ${i+1}`,status:'pending'})),truncated:truncated||records.length>5});
  }
  const relation=/\b(listing|propriete|inscription)\b.*\b(lie|associe)/.test(q);
  if(relation){
    const query=input.question.match(/(?:lié[e]?|associé[e]?)\s+(?:à|au|a)\s+(.+?)[?!.]*$/i)?.[1]?.trim();
    if(!query)return done('',null,'Indiquez le nom du Contact dont vous souhaitez vérifier les Listings liés.');
    const result=await run('crm_search_contacts',{query,limit:5}),contacts=list(result.data);
    if(contacts.length!==1 || result.nextPage!=null)return done('',null,contacts.length?'Plusieurs contacts sont possibles. Ouvrez la fiche appropriée pour préciser votre demande.':'Aucun contact correspondant trouvé dans vos accès.');
    const related=await run('crm_get_contact_listings',{contact_id:contacts[0].id});
    return done('Indiquer les liens propriétaires réellement trouvés; ne pas déduire un lien absent.',{records:list(related.listings).map((r,i)=>project(r,i,'Listing',prices)),truncated:related.truncated===true});
  }
  if(input.context && /\b(resum|dossier|fiche|prix|loyer|statut)/.test(q)) {
    const [,section,id]=input.context.split('/'),type=section==='contacts'?'contact':section==='listings'?'listing':'transaction';
    const result=await run(`crm_get_${type}`,{[`${type}_id`]:id});
    return done('Résumer uniquement les champs structurés disponibles. Notes, identité et coordonnées ne sont pas fournies.',{record:project(result,0,'Dossier',prices),deadlines:list(result.deadlines).map((r,i)=>project(r,i,'Échéance',false))});
  }
  // Search text is used only inside the CRM. It is never interpolated into a model prompt.
  const query=input.question.replace(/^(?:trouve(?:-moi)?|cherche|recherche|résume(?:-moi)?)\s*(?:(?:le|la|les|un|une)\s+)?(?:(?:dossier|fiche|contact)\s*)?(?:(?:de|du|de la)\s+)?/i,'').replace(/[?!.]+$/,'').trim();
  if(!/^(trouve|cherche|recherche|resume)/.test(q) || query===input.question || query.length<2)
    return done('',null,'Précisez une recherche de Contact, Listing ou Transaction, ou demandez les Listings actifs, échéances ou stocks. Chaque question est traitée séparément.');
  const found=await run('crm_search',{query,limit:5});
  const records=['contacts','listings','transactions'].flatMap(kind=>list(row(found[kind]).data).map(r=>({kind,r})));
  return done('Présenter les fiches trouvées sous leurs étiquettes. Les noms et adresses sont disponibles uniquement dans les liens CRM locaux. Ne pas inventer de relation.',{
    records:records.slice(0,5).map(({kind,r},i)=>project(r,i,kind==='contacts'?'Contact':kind==='listings'?'Listing':'Transaction',prices)),
    truncated:records.length>5||['contacts','listings','transactions'].some(kind=>row(found[kind]).nextPage!=null),
  });
}
