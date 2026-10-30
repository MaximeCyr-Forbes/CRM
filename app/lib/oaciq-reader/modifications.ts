import { cleanSpaces, norm, parseFrenchDate, extractTimeText, timeToIso } from './dates';
import { documentKind, formNumber, pagesText, extractActualClause } from './forms';
import { clauseAmount } from './price';
import type { OaciqAnalysis, OaciqExtractedDocument as Doc } from './types';

type Modification = NonNullable<OaciqAnalysis['documentaryState']>['modifications'][number];
export function formReferences(text: string): string[] {
  // OACIQ prints the D of PAD (and CC subtypes) in a separate box.
  const normalized = text.replace(/\bPA\s+D\b/gi, 'PAD').replace(/\bCC\s+([A-Z]{1,3})\s+(?=\d{5,6}\b)/g, 'CC$1 ');
  return [...new Set([...normalized.matchAll(/\b(PAD|PA|PP|AF|AR|CP|CC[A-Z]{0,3})\s*[- ]?\s*(\d{5,6})\b/gi)].map(m => `${m[1].toUpperCase()} ${m[2]}`))];
}
export function documentReference(doc: Doc): string {
  const pages=pagesText(doc), kind=documentKind(pages), number=formNumber(doc.name,pages);
  const codes = { promise_to_purchase:'PA', annex_f:'AF', annex_r:'AR', counter_proposal:'CP', modification:'MO', annex_water:'EAU', bonification:'BO', unknown:'' };
  const code = kind==='promise_to_purchase' ? formReferences(pages.join('\n')).find(r=>r.endsWith(` ${number}`))?.split(' ')[0] || 'PA' : codes[kind];
  return `${code} ${number}`;
}
/** PA is printed generically on some MO templates even for a PAD. Number must match. */
export function sameFormReference(a: string, b: string): boolean {
  return a===b || (/^PA[D]? /.test(a) && /^PA[D]? /.test(b) && a.split(' ')[1]===b.split(' ')[1]);
}
export function modificationIdentification(doc: Doc) {
  const block=extractActualClause(pagesText(doc),'M1.',['M2.']);
  const references=formReferences(block);
  const address=block.split(/(?:adresse suivante|following address)[^:]*:/i)[1]?.trim() || null;
  const otherConditionsUnchanged=/autres conditions[\s\S]*demeurent inchang/.test(norm(extractActualClause(pagesText(doc),'M5.',['M6.'])));
  return {document:doc.name,formNumber:formNumber(doc.name,pagesText(doc)),references,address,otherConditionsUnchanged};
}
export function parseModifications(doc: Doc): Modification[] {
  // Keep M4 continuations, but never read generation dates or footer examples as amendments.
  const pages=pagesText(doc).map(p=>p.split(/\(v\d|L[’']OACIQ A POUR MISSION/i)[0]);
  const primary=modificationIdentification(doc).references;
  const main=primary.find(r=>/^(?:PA[D]?|PP|CP|CC[A-Z]*) /.test(r));
  const result: Modification[]=[];
  const read=(text:string, fallbackSection?:string, defaultTarget=main) => {
    const normalized=norm(text);
    const leading=/^\s*((?:[A-Z]?\d+\.\d+(?:\.\d+)?)(?:\s*(?:et|,|&)\s*[A-Z]?\d+\.\d+(?:\.\d+)?)*)\s/i.exec(text);
    const clause=/\bclauses?\s+((?:[A-Z]?\d+\.\d+(?:\.\d+)?)(?:\s*(?:et|,|&)\s*[A-Z]?\d+\.\d+(?:\.\d+)?)*)/i.exec(text);
    const explicitSections=(leading?.[1] || clause?.[1])?.match(/[A-Z]?\d+\.\d+(?:\.\d+)?/gi);
    // A reference inside boilerplate ('courtier mentionné à la clause 2.1')
    // cannot replace a leading amendment heading (11.1 ACTE DE VENTE).
    let sections=explicitSections?.map(s=>s.toUpperCase()) || (fallbackSection ? [fallbackSection] : []);
    if (!sections.length) {
      if (/occupation/.test(normalized)) sections=['11.2'];
      else if (/acte de vente|notaire/.test(normalized)) sections=['11.1'];
      else if (/financement|hypothecaire/.test(normalized)) sections=['6.2'];
      else if (/prix/.test(normalized)) sections=['4.1'];
    }
    const daysMatch=/(\d+)\s+jours?\s+(?:suivant|apres)\s+l.?acceptation/i.exec(normalized);
    const extension=/prolong\w*\s+de\s+(\d+)\s+jours?/i.exec(normalized);
    let date: string | null=null, malformedDate=false;
    try { date=parseFrenchDate(text); } catch { malformedDate=true; /* Retain as pending without discarding other amendments. */ }
    const amount=/prix/.test(normalized) ? clauseAmount(text) : null;
    const explicit=formReferences(text);
    for(const section of sections) {
      const targetForm=explicit.find(r=>section.startsWith('F') ? r.startsWith('AF ') : true) || (section.startsWith('F') ? primary.find(r=>r.startsWith('AF ')) : defaultTarget);
      if (!targetForm || (!date && !daysMatch && !extension && amount===null && !malformedDate)) continue;
      result.push({document:doc.name,formNumber:formNumber(doc.name,pagesText(doc)),targetForm,section,
        days:daysMatch?+daysMatch[1]:null,date,time:date?timeToIso(extractTimeText(text)):null,
        ...(amount!==null?{amount}:{}),...(extension?{extensionDays:+extension[1]}:{}),text:cleanSpaces(text),applied:false});
    }
  };
  read(extractActualClause(pages,'M2.1',['M2.2']).replace(/^M2\.1\s*/,''),'M2.1');
  read(extractActualClause(pages,'M2.2',['M3.']).replace(/^M2\.2\s*/,''),'M2.2');
  read(extractActualClause(pages,'M3.1',['M3.2']).replace(/^M3\.1\s*/,''),'14.1');
  read(extractActualClause(pages,'M3.2',['M4.']).replace(/^M3\.2\s*/,''));
  for(const page of pages) {
    const free=(/^\s*M4\.\s*(?:AUTRES MODIFICATIONS(?:\s*\(suite\))?\s*)?([\s\S]*)/im.exec(page)?.[1] || '').split(/^\s*M[56]\./m)[0];
    // Line-leading clause headings and sentence boundaries separate independent dates.
    for(const part of free.split(/\n(?=\s*[A-Z]?\d+\.\d+\b)|(?=Le d[eé]lai mentionn[eé] [àa] la clause)|[.;]\s+(?=[A-ZÀÉ])/)) read(part);
  }
  return result;
}
