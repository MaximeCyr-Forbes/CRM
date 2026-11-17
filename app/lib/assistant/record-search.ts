import type {runReadTool} from './tools';
import {recordKey,recordPath,type RecordRequest} from './record-request';
type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.map(object):[];
export async function resolveRecord(request:RecordRequest,read:(name:string,args:Row)=>ReturnType<typeof runReadTool>){
 const {section,query,open}=request;
 const result=await read(section?`crm_search_${section}`:'crm_search',{query,limit:5,...(section==='contacts'?{name_only:true}:{})});
 const data=object(result.data),kinds=section?[section]:['contacts','listings','transactions'];
 const pages=kinds.map(kind=>({kind,page:section?data:object(data[kind])}));
 const candidates=pages.flatMap(({kind,page})=>rows(page.data).map(row=>({kind,row})));
 const more=pages.some(p=>p.page.nextPage!=null);
 const links=result.links.filter(l=>recordPath(l.href));
 if(!candidates.length)return {answer:'Aucune fiche accessible ne correspond à cette recherche.',links:[],source:'crm'};
 if(candidates.length!==1||more)return {answer:'Plusieurs fiches correspondent. Laquelle veux-tu ouvrir ?',links,source:'crm'};
 const {kind,row}=candidates[0],href=`/${kind}/${row.id}`;
 const label=kind==='contacts'?[row.first_name,row.last_name].filter(Boolean).join(' '):String(row.address??'Fiche');
 // A substring/address match alone is not sufficient to open a Contact automatically.
 const reliable=kind!=='contacts'||recordKey(label)===recordKey(query);
 if(!recordPath(href)||!links.some(l=>l.href===href))throw Error('ASSISTANT_INVALID_RECORD');
 const type=kind==='contacts'?'contact':kind==='listings'?'listing':'transaction';
 const detail=await read(`crm_get_${type}`,{[`${type}_id`]:row.id});
 if(object(detail.data).id!==row.id||!detail.links.some(l=>l.href===href))throw Error('ASSISTANT_INVALID_RECORD');
 return {answer:open&&reliable?'Fiche trouvée.':`Fiche trouvée : ${label}. Utilise le lien pour l’ouvrir.`,links:[{href,label}],source:'crm',...(open&&reliable?{navigateTo:href}:{})};
}
