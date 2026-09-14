import { cleanSpaces, norm, parseFrenchDate, extractTimeText, timeToIso } from './dates';
import { documentKind, formNumber, pagesText, extractActualClause } from './forms';
import type { OaciqAnalysis, OaciqExtractedDocument as Doc } from './types';

type Modification = NonNullable<OaciqAnalysis['documentaryState']>['modifications'][number];
export function formReferences(text: string): string[] {
  return [...new Set([...text.matchAll(/\b(PAD|PA|PP|AF|AR|CP)\s*[- ]?\s*(\d{5,6})\b/gi)].map(m => `${m[1].toUpperCase()} ${m[2]}`))];
}
export function documentReference(doc: Doc): string {
  const codes = { promise_to_purchase:'PA', annex_f:'AF', annex_r:'AR', counter_proposal:'CP', modification:'MO', annex_water:'EAU', bonification:'BO', unknown:'' };
  return `${codes[documentKind(pagesText(doc))]} ${formNumber(doc.name, pagesText(doc))}`;
}
export function parseModifications(doc: Doc): Modification[] {
  const pages = pagesText(doc);
  const primary = formReferences(extractActualClause(pages, 'M1.', ['M2.']));
  const result: Modification[] = [];
  const read = (text: string, defaultTarget: string | undefined) => {
    const section = /clause\s+([A-Z]?\d+\.\d+(?:\.\d+)?)/i.exec(text)?.[1].toUpperCase();
    if (!section) return;
    const explicit = formReferences(text);
    const targetForm = explicit[0] || (section.startsWith('F') ? primary.find(r=>r.startsWith('AF ')) : defaultTarget);
    if (!targetForm) return;
    const daysMatch = /(\d+)\s+jours?\s+suivant\s+l.?acceptation/i.exec(norm(text));
    const date = parseFrenchDate(text);
    if (!daysMatch && !date) return;
    result.push({document:doc.name,formNumber:formNumber(doc.name,pages),targetForm,section,
      days:daysMatch ? +daysMatch[1] : null,date,time:date ? timeToIso(extractTimeText(text)) : null,text:cleanSpaces(text),applied:false});
  };
  read(extractActualClause(pages,'M3.1',['M3.2']),primary.find(r=>/^PA[D]? |^PP /.test(r)));
  read(extractActualClause(pages,'M3.2',['M4.']),primary.find(r=>/^PA[D]? |^PP /.test(r)));
  const free = extractActualClause(pages,'M4.',['M5.']).split(/\(v\d|L[’']OACIQ A POUR MISSION/i)[0];
  // Each explicit clause starts its own replacement. Never add old and new days.
  const parts = free.split(/(?=Le d[eé]lai mentionn[eé] [àa] la clause)/i);
  for (const part of parts) read(part, primary.length===1 ? primary[0] : undefined);
  return result;
}
