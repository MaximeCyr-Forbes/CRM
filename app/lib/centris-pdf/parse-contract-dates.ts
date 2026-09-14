import { normalizeCentrisText } from './normalize-text';
import type { ExtractedPDFPage } from './types';

const labels = {contractSignedDate:'Date de signature du contrat',contractExpirationDate:"Date d'expiration"};
const anyLabel = "(?:Date de signature du contrat|Date d'expiration)";
export function parseContractDates(pages: ExtractedPDFPage[]) {
  const dates = {contractSignedDate:null as string|null,contractExpirationDate:null as string|null};
  const warnings:string[]=[];
  const sourcePages:Record<string,number[]>={};
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) {
    const values = new Set<string>(); let invalid=false;
    sourcePages[key]=[];
    for(const page of pages) {
      const text=normalizeCentrisText(page.text).replace(/[’‘]/g,"'");
      const firstLabel=new RegExp(anyLabel,'i').exec(text);
      const firstHasBefore=firstLabel && /\b\d{4}-\d{2}-\d{2}\s*$/.test(text.slice(0,firstLabel.index));
      const firstHasAfter=firstLabel && /^\s*:?\s*\d{4}-\d{2}-\d{2}\b/.test(text.slice(firstLabel.index+firstLabel[0].length));
      const direction=firstHasBefore && !firstHasAfter ? 'before' : firstHasAfter && !firstHasBefore ? 'after' : null;
      for(const match of text.matchAll(new RegExp(labels[key],'gi'))) {
        sourcePages[key].push(page.pageNumber);
        const start=match.index!,end=start+match[0].length;
        const after=/^\s*:?\s*(\d{4}-\d{2}-\d{2})\b/.exec(text.slice(end));
        const before=/\b(\d{4}-\d{2}-\d{2})\s*$/.exec(text.slice(0,start));
        const candidates:string[]=[];
        // PDF text may order a value before its label. Do not borrow the date
        // directly attached to the neighbouring contract label.
        if(after && direction==='after') candidates.push(after[1]);
        if(before && direction==='before') candidates.push(before[1]);
        if(!direction && (after || before)) invalid=true;
        for(const candidate of candidates) {
          const date=new Date(`${candidate}T12:00:00Z`);
          if(!Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===candidate) values.add(candidate);
          else invalid=true;
        }
      }
    }
    if(values.size===1 && !invalid) dates[key]=[...values][0];
    if(invalid || values.size>1) warnings.push(`${labels[key]} : date invalide ou contradictoire, à renseigner manuellement.`);
    sourcePages[key]=[...new Set(sourcePages[key])];
  }
  return {dates,warnings,sourcePages};
}
