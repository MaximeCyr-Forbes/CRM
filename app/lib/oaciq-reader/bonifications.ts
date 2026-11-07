import { latest, norm, parseVisibleSignatureDate } from './dates';
import { documentKind, extractPropertyAddress, formNumber, pagesText } from './forms';
import { clauseAmount, priceClause } from './price';
import { documentReference, formReferences, readAmendmentText } from './modifications';
import type { OaciqAnalysis, OaciqExtractedDocument as Doc } from './types';

type Modification = NonNullable<OaciqAnalysis['documentaryState']>['modifications'][number];
export type Bonification = {
  document:string; documentType:'BO'; number:string; target:string; mainFormNumber:string;
  mainFormMatch:'number'|'address'|'none'; versionDetected:string; amount:number|null; address:string|null;
  signedAt:string|null; previousBOvoided:boolean; otherConditionsUnchanged:boolean;
  modifications:Modification[]; affectedFields:string[]; warnings:string[];
  confidence:'high'|'low'; applicable:boolean; superseded:boolean;
};
const addressKey=(value:string)=>norm(value).replace(/\b(?:qc|quebec)\b/g,'').replace(/[^a-z0-9]/g,'');

/** OACIQ B1-B4 are evidence, not independent contracts. B4 never establishes acceptance.
 * Sources: https://www.oaciq.com/media/qpvpcymt/bonifications-avant-acceptation-bo-2026-changements.pdf
 * and OACIQ guide "Bonifier une promesse d’achat avant son acceptation" (B1-B4).
 * The current v13 08/2025 form adds B3.2; older versions are cumulative. */
export function parseBonification(doc:Doc, parentReference?:string):Bonification {
  const pages=pagesText(doc).map(p=>p
    .replace(/^.*IDENTIFICATION DU FORMULAIRE PRINCIPAL\s*$/gim,'B1. IDENTIFICATION DU FORMULAIRE PRINCIPAL')
    .replace(/^.*BONIFICATION DE LA PROMESSE D.ACHAT.*$/gim,'B2. BONIFICATION')
    .replace(/^.{0,12}AUTRES CONDITIONS\s*$/gim,'B3. AUTRES CONDITIONS')
    .replace(/^.{0,12}SIGNATURES\s*$/gim,'B4. SIGNATURES')
    .replace(/\bPA\s*[|[]?\s*D\s*[|\]]?\s*[-|]?\s*[|[]?\s*(?=\d{5,6}\b)/gi,'PAD '));
  const normalizedDoc={...doc,ocrPages:pages},text=pages.join('\n');
  const identification=priceClause(normalizedDoc,'B1.','B2.');
  const address=identification.split(/adresse suivante\s*[:.]+\s*/i)[1]?.trim() || null;
  const refs=formReferences(identification).filter(r=>/^(?:PAD|PA|PP) /.test(r));
  const numbers=[...new Set([...identification.split(/portant|immeuble|property/i)[0].matchAll(/\b\d{5,6}\b/g)].map(m=>m[0]))];
  const target=refs.length===1?refs[0].split(' ')[1]:refs.length===0&&numbers.length===1?numbers[0]:'';
  // Keep line boundaries and continuation pages; stop before boilerplate/signatures.
  const body=pages.map(p=>p.split(/L[’']OACIQ A POUR MISSION|LECTURE CIBL[EÉ]E|\(v\d/)[0]).join('\n');
  const free=/\bB2\.2\s*(?:AUTRES)?\s*([\s\S]*?)(?=\bB3\.|\bB4\.|$)/i.exec(body)?.[1]||'';
  const b3=/\bB3\.[\s\S]*?(?=\bB4\.|$)/i.exec(text)?.[0]||'';
  const previousBOvoided=/(?:bonification|\bbo\b)[\s\S]{0,180}(?:anterieur|precedent)[\s\S]{0,100}(?:nul|annul|remplac)|(?:annul|remplac)[\s\S]{0,100}(?:bonification|\bbo\b)[\s\S]{0,60}(?:anterieur|precedent)/.test(norm(`${b3} ${free}`));
  const warnings:string[]=[], modifications:Modification[]=[];
  const primary=refs.length===1?refs:target?[`PA ${target}`]:parentReference?[parentReference]:[];
  for(const part of free.split(/\n(?=\s*\d+\.\d+\b)|[.;]\s+(?=[A-ZÀÉ])/)) {
    const clean=part.replace(/L[’']OACIQ A POUR MISSION[\s\S]*$/i,'').trim();
    if(!clean || /^(?:AUTRES|BO\s*\d+|\(v\d)/i.test(clean))continue;
    const changes=readAmendmentText(doc,clean,primary);
    if(!changes.length && !/(?:bonification|\bbo\b).*(?:annul|nul|remplac)/i.test(norm(clean)))warnings.push(`BO : contenu B2.2 à confirmer : ${clean}`);
    modifications.push(...changes.map(m=>({...m,documentType:'BO' as const})));
  }
  const amount=clauseAmount(priceClause(normalizedDoc,'B2.1','B2.2'));
  if(amount===null && /\d[\d ,.]*\s*\$/.test(priceClause(normalizedDoc,'B2.1','B2.2')))warnings.push('BO : montant B2.1 ambigu, prix à confirmer.');
  return {document:doc.name,documentType:'BO',number:formNumber(doc.name,pages),target,mainFormNumber:target,address,
    mainFormMatch:target?'number':'none',versionDetected:/\bB3\.2\b/.test(text)?'B3.2':/(\(v\d+[^)]*\))/i.exec(text)?.[1]||'legacy',amount,
    signedAt:latest([...doc.signatures.map(s=>s.visibleSignedAt||(s.certificateSignedAt?null:s.signedAt)),...pages.map(parseVisibleSignatureDate)]),
    previousBOvoided,otherConditionsUnchanged:/autres conditions[\s\S]*demeurent inchang/.test(norm(b3)),
    modifications,affectedFields:[...(amount!==null?['price']:[]),...new Set(modifications.map(m=>m.section))],warnings,confidence:warnings.length?'low':'high',applicable:false,superseded:false};
}

/** Resolve before applying any field: a superseding BO restores the PA/annex baseline. */
export function resolveBonifications(documents:Doc[],main:Doc,acceptedAt:string|null) {
  const mainNumber=formNumber(main.name,pagesText(main));
  const forms=documents.filter(d=>documentKind(pagesText(d))==='bonification').map(doc=>parseBonification(doc));
  for(const b of forms) {
    if(!b.target) {
      const doc=documents.find(d=>d.name===b.document)!;
      const address=b.address;
      const matches=address?documents.filter(d=>documentKind(pagesText(d))==='promise_to_purchase' && addressKey(extractPropertyAddress(d)||'')===addressKey(address)):[];
      if(matches.length===1 && matches[0]===main){Object.assign(b,parseBonification(doc,documentReference(main)));b.target=mainNumber;b.mainFormNumber=mainNumber;b.mainFormMatch='address';}
    }
    b.applicable=b.target===mainNumber && !(acceptedAt&&b.signedAt&&Date.parse(b.signedAt)>Date.parse(acceptedAt));
    if(!b.applicable)b.warnings.push('BO : formulaire principal ou applicabilité avant acceptation à confirmer.');
    for(const m of b.modifications)if(!m.targetForm)m.targetForm=documentReference(main);
  }
  const eligible=forms.filter(b=>b.applicable);
  const ordered=eligible.length<2 || eligible.every(b=>b.signedAt)&&new Set(eligible.map(b=>b.signedAt)).size===eligible.length;
  if(ordered)eligible.sort((a,b)=>(a.signedAt||'').localeCompare(b.signedAt||''));
  else if(eligible.some(b=>b.previousBOvoided) || eligible.some((b,i)=>eligible.slice(i+1).some(other=>b.affectedFields.some(f=>other.affectedFields.includes(f))))) {
    for(const b of eligible){b.applicable=false;b.confidence='low';b.warnings.push('BO : ordre documentaire ambigu; modifications à confirmer.');}
  }
  let active:Bonification[]=[];
  for(const b of eligible.filter(b=>b.applicable)){
    if(b.previousBOvoided){for(const old of active){old.superseded=true;old.applicable=false;}active=[];}
    active.push(b);
  }
  return {forms,active,modifications:active.flatMap(b=>b.modifications),warnings:forms.flatMap(b=>b.warnings)};
}
