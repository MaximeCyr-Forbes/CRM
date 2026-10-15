import { captureDates, captureClientWarnings, captureTableText, normalizedCaptureName, parseCaptureText, type CaptureResult, type CaptureWord, type ImportClient } from './direct-client-capture';
export type CaptureFormat = 'ChatGPT' | 'Centris' | 'unknown';
export type CaptureProperty = {address?:string|null;listingNumber?:string|null};
const label=(s:string)=>normalizedCaptureName(s).replace(/\s*:\s*$/,'');
const labels=new Set(['type','nom','courriel','email','telephone','message','date','date de reception']);
export function detectScreenshotFormat(text:string):CaptureFormat {
 const lines=text.split(/\r?\n/).map(label),normal=normalizedCaptureName(text);
 if(lines.some(l=>/\bnom\b/.test(l)&&/telephone/.test(l)&&/courriel|email/.test(l)&&/provenance|source/.test(l)))return 'ChatGPT';
 const fields=['nom','courriel','email','telephone','message','type'].filter(l=>lines.includes(l));
 if((/centris\s*\.\s*ca|formulaire de contact/.test(normal)&&fields.length>=3&&lines.includes('message')) ||
    (fields.length>=5&&/vous a envoye|concernant l'inscription/.test(normal)))return 'Centris';
 return 'unknown';
}
/** Reconstruct vertical email fields while excluding sidebars and photo OCR noise. */
export function captureLeadText(words:CaptureWord[],fallback:string){
 const anchor=words.find(w=>label(w.text)==='nom'&&words.some(o=>/^(courriel|email)$/.test(label(o.text))&&o.y>w.y&&Math.abs(o.x-w.x)<Math.max(w.height,o.height)*2));
 if(!anchor)return fallback;
 const sorted=words.filter(w=>w.x>=anchor.x-anchor.height*2).sort((a,b)=>a.y+a.height/2-b.y-b.height/2);
 const lines:CaptureWord[][]=[];
 for(const w of sorted){const line=lines.at(-1),first=line?.[0];if(first&&Math.abs(w.y+w.height/2-first.y-first.height/2)<Math.max(w.height,first.height)*.6)line!.push(w);else lines.push([w]);}
 const out:string[]=[];let message=false,previous=0;
 for(const line of lines){line.sort((a,b)=>a.x-b.x);const text=line.map(w=>w.text).join(' ');const n=label(text);
  if(message&&(line[0].y-previous>anchor.height*4||/^(voir la fiche|repondre|transferer|se desabonner)/.test(n)))break;
  out.push(text);if(n==='message')message=true;previous=Math.max(...line.map(w=>w.y+w.height));
 }
 return out.join('\n');
}
export function parseCentrisLead(text:string,today:string):CaptureResult {
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);const fields:Record<string,string[]>={};let current='';
 for(const line of lines){const n=label(line);if(/^(voir la fiche|repondre|transferer|se desabonner|confidentialite)/.test(n)){if(current==='message')break;continue;}
  if(labels.has(n)&&current!=='message'){current=n;fields[current]??=[];continue;}
  if(current)fields[current].push(line);
 }
 const get=(key:string)=>fields[key]?.join(' ').trim()||null;
 const intro=text.match(/(?:^|\n)\s*([^\n]+?)\s+vous a envoy[ée]/i)?.[1]?.trim();
 const name=get('nom')||intro||'';
 if(!name)throw Error('Nom du client non reconnu.');
 const missing=(s:string|null)=>!s||/^(non fourni|aucun|n\/a|[-—])$/i.test(s)?null:s;
 const rawEmail=missing(get('courriel')||get('email'))?.replace(/\s+/g,'').replace(/[;,]+$/,'')??null;
 const email=rawEmail?.replace(/\(@/g,'@')??null;
 const phone=missing(get('telephone'));
 const type=get('type'),message=get('message');
 const address=message?.match(/(?:situ[ée]e?\s+(?:au|à|a)|(?:au|à)\s+(?=\d))\s*(\d[^\n#()]+?)(?=\s*\(#|\s*#|[.!?]|$)/i)?.[1]?.trim().replace(/[,\s]+$/,'')??null;
 const listing=message?.match(/(?:#|(?:inscription|centris)\s*(?:n[°o]\s*)?:?\s*)(\d{6,10})\b/i)?.[1]??null;
 // Only explicit reception/date fields with a year qualify, never a date in the message or computer UI.
 const dateText=get('date de reception')||get('date');const date=dateText&&/\b\d{4}\b/.test(dateText)?captureDates(dateText,today).date:null;
 const client:ImportClient={name,email,phone,source:'Centris',request_date:date,request_note:[type,message].filter(Boolean).join(' — ')||null,warnings:[],sourceFormat:'Centris',properties:[{address,listingNumber:listing}]};
 client.warnings=captureClientWarnings(client);
 if(email!==rawEmail)client.warnings.push('Artefact de lecture retiré près du @ : vérifiez le courriel.');
 if(dateText&&!date)client.warnings.push('Date de réception à vérifier.');
 return {clients:[client],warnings:[],format:'Centris'};
}
export function parseScreenshot(text:string,words:CaptureWord[],today:string):CaptureResult{
 const table=captureTableText(words);const lead=captureLeadText(words,text);
 const format=detectScreenshotFormat(table||lead);
 if(format==='ChatGPT')return {...parseCaptureText(table||text,today),format};
 if(format==='Centris')return parseCentrisLead(lead,today);
 // Delimited text is also useful for anonymized fixtures and OCR without geometry.
 if(detectScreenshotFormat(text)==='ChatGPT')return {...parseCaptureText(text,today),format:'ChatGPT'};
 throw Error('Format de capture non reconnu.');
}
const normalizedAddress=(s:string)=>normalizedCaptureName(s).replace(/\b(rue|r\.|avenue|av\.|boulevard|boul\.|chemin|ch\.|de|du|des|la|le|l')\b/g,' ').replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
export function capturePropertyMatch(capture:CaptureProperty,transaction:CaptureProperty):'match'|'mismatch'|'unknown'{
 const a=capture.listingNumber?.replace(/\D/g,''),b=transaction.listingNumber?.replace(/\D/g,'');
 if(a&&b)return a===b?'match':'mismatch';
 if(!capture.address||!transaction.address)return 'unknown';
 const ca=normalizedAddress(capture.address),ta=normalizedAddress(transaction.address);
 if(!/^\d+ [a-z]/.test(ca)||!/^\d+ [a-z]/.test(ta))return 'unknown';
 if(ca===ta||ca.startsWith(ta+' ')||ta.startsWith(ca+' '))return 'match';
 // Different street numbers are clear evidence; spelling/OCR differences remain uncertain.
 if(ca.match(/^\d+/)?.[0]!==ta.match(/^\d+/)?.[0])return 'mismatch';
 const streetA=ca.split(' ')[1],streetB=ta.split(' ')[1];
 if(streetA.length>=3&&streetB.length>=3&&streetA!==streetB)return 'mismatch';
 return 'unknown';
}
