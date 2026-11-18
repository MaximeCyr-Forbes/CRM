import {modules} from './knowledge';
import type {QueryPlan} from './query-plan';
import {recordPath,recordKey} from './record-request';

// Exact destination nouns: residual names, addresses, dates and filters remain
// data requests. Routes come exclusively from the verified knowledge catalogue.
const navigationAliases:Record<keyof typeof modules,readonly string[]>={
 dashboard:['accueil','dashboard','tableau de bord'],contacts:['contacts','contact','clients'],
 listings:['listings','inscriptions','proprietes'],transactions:['transactions','dossiers'],
 accounting:['comptabilite'],inventory:['inventaire','pancartes','bac','pancartes bac','pancartes et bac','stock'],
 mortgage:['references hypothecaires','references'],calendar:['calendrier','agenda'],drive:['drive','google drive'],
 statistics:['statistiques','stats'],emails:['courriels auto','courriels automatiques','campagnes personnalisees'],
 settings:['parametres','reglages'],software:['logiciels','generateur courriel','generateur de courriel','generateur de delais','delais de promesse d achat'],
 acm:['acm','generateur acm','analyse comparative de marche'],plex:['plex','calculatrice plex'],
};
export const teamCalendarPath=`${modules.calendar.href}?mode=team`;
export function isSafeCrmNavigationPath(value:unknown):value is string{
 return typeof value==='string'&&(recordPath(value)||value===teamCalendarPath||Object.values(modules).some(m=>m.href===value));
}
export function moduleNavigationRequest(question:string){
 let q=recordKey(question).replace(/^(?:svp|stp|s il te plait|s il vous plait) /,'').replace(/ (?:svp|stp|s il te plait|s il vous plait)$/,'');
 q=q.replace(/^(?:peux tu|pourrais tu|pouvez vous|pourriez vous) /,'');
 q=q.replace(/^m ouvrir /,'ouvrir ').replace(/^me montrer /,'montrer ');
 const command=/^(?:(?:amene|emmene|dirige)(?: moi)?|va|aller|retourne|retourner|ouvre|ouvrir|affiche|afficher|montre(?: moi)?|montrer|accede|acceder|je (?:veux|voudrais|souhaite) (?:aller|voir|consulter|ouvrir)) /;
 if(!command.test(q))return;
 q=q.replace(command,'').replace(/^(?:a|au|aux|dans|sur|vers) /,'').replace(/^(?:l |le |la |les |mon |ma |mes |nos |notre |ton |ta |tes )/,'');
 const team=/ (?:de l equipe|d equipe|equipe|partage|partagee)$/.test(q);
 if(team)q=q.replace(/ (?:de l equipe|d equipe|equipe|partage|partagee)$/,'');
 const id=(Object.keys(modules) as Array<keyof typeof modules>).find(id=>navigationAliases[id].includes(q));
 if(!id||team&&id!=='calendar')return;
 return {kind:'module' as const,moduleId:id,...(id==='calendar'?{view:team?'team' as const:'personal' as const}:{}),...(id==='software'&&q==='logiciels'?{chooseSoftware:true}:{})};
}

/** Capabilities describe verified reads, not a grant of access. The tool layer still checks RLS. */
export const relationships={
 contact_listings:{from:'contact',to:'listing',collection:'listings',tool:'crm_get_contact_listings',key:'listing_contacts.contact_id',role:'owner'},
 contact_transactions:{from:'contact',to:'transaction',collection:'transactions',tool:'crm_get_contact_transactions',key:'transaction_contacts.contact_id'},
 transaction_contacts:{from:'transaction',to:'contact',collection:'contacts',tool:'crm_get_transaction_contacts',key:'transaction_contacts.transaction_id'},
 transaction_deadlines:{from:'transaction',to:'deadline',collection:'deadlines',tool:'crm_get_transaction',key:'transaction_deadlines.transaction_id'},
 transaction_drive:{from:'transaction',to:'document',collection:'data',tool:'crm_get_transaction_documents',key:'google_drive_entity_links.transaction_id'},
 listing_owners:{from:'listing',to:'contact',collection:'contacts',tool:'crm_get_listing_owners',key:'listing_contacts.listing_id',role:'owner'},
 listing_transactions:{from:'listing',to:'transaction',collection:'transactions',tool:'crm_get_listing_transactions',key:'listing_transaction_links.listing_id'},
 listing_visits:{from:'listing',to:'visit',collection:'data',tool:'crm_get_listing_visits',key:'listing_visits.listing_id'},
 listing_offers:{from:'listing',to:'offer',collection:'data',tool:'crm_get_listing_offers',key:'listing_offers.listing_id'},
 listing_signs:{from:'listing',to:'sign',collection:'data',tool:'crm_get_listing_signs',key:'sign_assignments.listing_id'},
} as const;
const capabilities={
 contacts:{entity:'contact',tools:['crm_search_contacts','crm_get_contact','crm_get_due_contact_followups','crm_count_records'],fields:['first_name','last_name','phone','email','broker','client_provenance','status','next_follow_up_date'],sensitive:['phone','email','address']},
 listings:{entity:'listing',tools:['crm_search_listings','crm_get_listing','crm_get_active_broker_listings','crm_get_broker_listings'],fields:['address','broker','displayStatus','askingPrice'],sensitive:['address','notes']},
 transactions:{entity:'transaction',tools:['crm_search_transactions','crm_get_transaction','crm_get_active_broker_transactions','crm_get_private_deadlines','crm_count_records'],fields:['address','status','broker','notaryDate','deadlines'],sensitive:['address','notes','price']},
 accounting:{entity:'expense',tools:['crm_query_accounting'],fields:['vendor','expense_date','paid_at','amount'],sensitive:['vendor','amount']},
 inventory:{entity:'inventory',tools:['crm_get_sign_inventory'],fields:['available','used','total'],sensitive:[]},
 mortgage:{entity:'mortgage_referral',tools:['crm_get_mortgage_referrals'],fields:['paid_at','paid_amount'],sensitive:['mortgage_advisor_name','paid_amount']},
} as const;
export const catalog=Object.entries(modules).map(([id,module])=>{
 const read=capabilities[id as keyof typeof capabilities];
 return {id,label:module.label,route:module.href,entity:read?.entity??'unknown',
  capabilities:['how_to','navigate',...(read?['read']:[]),...(read?.tools.some(t=>t.startsWith('crm_search'))?['search']:[])],tools:read?.tools??[],fields:read?.fields??[],sensitiveFields:read?.sensitive??[],
  relations:Object.entries(relationships).filter(([,r])=>r.from===read?.entity).map(([key])=>key),
  permissions:['authenticated CRM membership','existing RLS','broker scope checked by server'],
  forbidden:['write','send','finalize','external AI','infer relationships by address'],source:module.source,
  limits:read?'Bounded excerpt; totals only from complete queries.':'Verified UI help only; no data read.',help:module.overview};
});
export function moduleCapability(plan:QueryPlan){return catalog.find(m=>m.id===plan.module);}
