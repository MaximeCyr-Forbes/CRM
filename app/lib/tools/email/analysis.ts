import { createHash } from 'node:crypto';
import { analyzeOaciqDocuments } from '../../oaciq-reader';
import { extractOaciqPdf } from '../../oaciq-reader/pdf';
import { documentKind, formNumber, pagesText, extractPropertyAddress } from '../../oaciq-reader/forms';
import { extractTransactionDetails } from '../../oaciq-reader/transaction-details';
import type { OaciqPdfInput, OaciqExtractedDocument, OaciqAnalysis } from '../../oaciq-reader/types';
import { consolidate } from './engine';

/** Group explicit references first, without merging two different PAs at one address. */
export function groupEmailDocuments(documents: OaciqExtractedDocument[]) {
 const facts=documents.map(doc=>({doc,kind:documentKind(pagesText(doc)),number:formNumber(doc.name,pagesText(doc)),address:(extractPropertyAddress(doc)||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(quebec|qc|canada)\b|[a-z]\d[a-z]\s*\d[a-z]\d/gi,'').replace(/[^a-z0-9]/gi,'').toLowerCase(),refs:[...pagesText(doc).join('\n').matchAll(/\b(?:PA|PAD|CP|AF|AR|MO|BO)[\s-]*(\d{4,6})\b/gi)].map(m=>m[1])}));
 const parent=facts.map((_,i)=>i);const root=(i:number):number=>parent[i]===i?i:root(parent[i]);
 const join=(a:number,b:number)=>{parent[root(b)]=root(a);};
 for(const [i,f] of facts.entries())for(const ref of f.refs.filter(n=>n!==f.number)){
  const matches=facts.flatMap((other,j)=>other.number===ref?[j]:[]);
  if(matches.length===1)join(i,matches[0]);
  if(!matches.length)for(let j=0;j<i;j++)if(facts[j].refs.includes(ref)&&facts[j].number!==ref)join(i,j);
 }
 for(const [i,f] of facts.entries()){
  if(f.kind==='promise_to_purchase'||f.refs.some(n=>n!==f.number)||!f.address)continue;
  const matches=facts.flatMap((other,j)=>other.kind==='promise_to_purchase'&&other.address===f.address?[j]:[]);
  if(matches.length===1)join(i,matches[0]);
 }
 const groups=new Map<number,OaciqExtractedDocument[]>();facts.forEach((f,i)=>{const key=root(i);groups.set(key,[...(groups.get(key)||[]),f.doc]);});return [...groups.values()];
}
const kindNames: Record<string,string>={promise_to_purchase:'PA',counter_proposal:'CP',annex_f:'AF',annex_r:'AR',annex_water:'EAU',modification:'MO',bonification:'BO'};
export function emailTransactionFromAnalysis(data: OaciqAnalysis, documents: OaciqExtractedDocument[]) {
 const main=data.forms.find(f=>f.document===data.mainDocument),mainForm=main?`${kindNames[main.kind]||main.kind}-${main.number}`:'';
 const details=extractTransactionDetails(documents.find(d=>d.name===data.mainDocument));
 const sourceFor=(d:OaciqAnalysis['deadlines'][number])=>({source_form:`${kindNames[data.forms.find(f=>f.document===d.sourceDocument)?.kind||'']||'PA'}-${d.sourceForm||main?.number||''}`,source_number:d.sourceForm||'',source_clause:d.sourceSection||'',source_page:(documents.find(doc=>doc.name===d.sourceDocument)?.pages.findIndex(p=>!!d.sourceText&&p.text.includes(d.sourceText))??-1)+1||null,detected_text:d.sourceText||'',confidence:d.confidence==='high'?1:d.confidence==='medium'?.8:.5,method:'native'});
 const conditions=data.deadlines.map((d,index)=>({id:`${mainForm}:${d.type}:${index}`,type:d.type,label:d.title,source:sourceFor(d),form:mainForm.split('-')[0],clause:d.sourceSection||'',source_page:sourceFor(d).source_page,trigger:d.relativeRule?.reference||'explicit',duration_days:d.relativeRule?.days??null,explicit_date:d.relativeRule?null:d.dueDate,deadline_time:d.dueTime,active:true,confidence:d.confidence==='high'?1:.8,contingency:d.relativeRule?.suffix||'',date:d.dueDate,time:d.dueTime}));
 // Restore dependency edges that the transaction agenda exposes as resolved dates.
 for(const [childType,parentType] of [['documents_review','documents_delivery'],['inspection_report','inspection']] as const){
  const child=conditions.find(c=>c.type===childType),parent=conditions.find(c=>c.type===parentType);
  if(child&&parent&&child.duration_days!==null&&parent.duration_days!==null){child.trigger=`condition:${parent.id}`;child.duration_days-=parent.duration_days;}
 }
 const notary=conditions.find(c=>c.type==='notary');
 for(const c of conditions)if(notary&&['occupancy','septic_pumping'].includes(c.type)&&/acte notari|notarial deed|signature.{0,40}acte/i.test(c.source.detected_text)){c.trigger=`condition:${notary.id}`;c.duration_days=0;c.explicit_date=null;}
 const proof={source_form:mainForm,source_clause:data.acceptanceSource,source_page:null,detected_text:'Date contractuelle du lecteur OACIQ',confidence:1,method:'native'};
 const acceptance=data.acceptanceDateTime?{action:'accept',confidence:1,required_signers:['resolved-response'],signatures:[{signer_id:'resolved-response',present:true,datetime:data.acceptanceDateTime,confidence:1,source:proof}]}:{action:'unknown',confidence:0};
 const id=createHash('sha256').update(documents.map(d=>d.name).sort().join('\n')).digest('hex').slice(0,24);
 return consolidate({id,main_form:mainForm,property_address:data.propertyAddress,client_names:details.buyers.map(p=>p.fullName),buyer_names:details.buyers.map(p=>p.fullName),seller_names:details.sellers.map(p=>p.fullName),acceptance,conditions,issues:[...data.warnings,...(data.contractRequiresReview?['Vérifiez la chaîne contractuelle et les signatures.']:[])],terms:{price:{value:data.finalPrice,source_form:data.priceSourceForm,source_clause:data.priceSourceSection},acceptance_deadline:data.documentaryState?.acceptanceDeadline},documents:data.forms.map(f=>({form_id:`${kindNames[f.kind]||f.kind}-${f.number}`,file_name:f.document,target_number:data.documentaryState?.links.find(l=>l.document===f.document)?.targetForm||''})),amendments:data.documentaryState?.modifications||[],overrides:[],events:{}});
}
export async function analyzeEmailBundle(inputs: OaciqPdfInput[]) {
 const docs:OaciqExtractedDocument[]=[],errors:string[]=[];
 for(const input of inputs){try{docs.push(await extractOaciqPdf(input));}catch{errors.push(`${input.name} : document à vérifier.`);}}
 if(!docs.length)throw new Error('Aucun document exploitable.');
 const transactions=[];
 for(const group of groupEmailDocuments(docs)){
  const analysis=await analyzeOaciqDocuments(group);analysis.warnings.push(...errors);
  const transaction=emailTransactionFromAnalysis(analysis,group);
  transaction.documents=transaction.documents.map((document:any)=>{
   const doc=group.find(d=>d.name===document.file_name)!;
   const kind=document.form_id.split('-')[0];
   const visualPages=doc.pages.flatMap((p,i)=>p.text.trim().length<150||['CP','MO','BO','unknown'].includes(kind)||(!analysis.acceptanceDateTime&&/réponse du vendeur|réponse du répondant|seller|respondent/i.test(p.text))?[i+1]:[]);
   if(visualPages.length&&!visualPages.includes(1))visualPages.unshift(1);
   return {...document,input_index:inputs.findIndex(input=>input.name===doc.name),visual_pages:visualPages,pages:doc.pages.map(p=>p.text.slice(0,18000))};
  });
  transactions.push(transaction);
 }
 return {ok:true,transactions};
}
