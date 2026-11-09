import { directClientDuplicates, normalizedDirectPhone, parseDirectClient, type DirectClient, type DirectClientDraft } from "./direct-clients";

export type ImportClient = DirectClientDraft & { warnings: string[]; sourceFormat?: "ChatGPT"|"Centris"; properties?: {address?:string|null;listingNumber?:string|null}[] };
export type CaptureResult = { clients: ImportClient[]; format?: "ChatGPT"|"Centris"; warnings: string[] };
export type CaptureWord = { text: string; x: number; y: number; width: number; height: number; confidence: number };
export const normalizedCaptureName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g,"'").replace(/\s+/g," ").replace(/-\s+/g,"-").trim();
const missing = (s: string) => /^(?:non fourni[es]?|pas fourni[es]?|n\/?a|aucun[e]?|[-—–]*)$/i.test(s.trim());
const clean = (s = "") => missing(s) ? null : s.trim() || null;
const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
export function captureDates(raw: string, today: string) {
  const normalized = normalizedCaptureName(raw);
  const dates: string[] = []; let inferred = false;
  for (const match of normalized.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) dates.push(match[0]);
  for (const match of normalized.matchAll(/\b(\d{1,2})(?:er)?\s+([a-z]+)\.?\s*(\d{4})?\b/g)) {
    const month = months.findIndex(m => m === match[2] || (match[2].length >= 3 && m.startsWith(match[2])));
    if (month < 0) continue;
    const year = match[3] || today.slice(0,4); inferred ||= !match[3];
    dates.push(`${year}-${String(month+1).padStart(2,"0")}-${match[1].padStart(2,"0")}`);
  }
  const valid = dates.filter(date => { try { parseDirectClient({ name: "validation", request_date: date }); return true; } catch { return false; } });
  const warnings: string[] = [];
  if (raw.trim() && !missing(raw) && (!valid.length || valid.length !== dates.length)) warnings.push("Date à vérifier : " + raw);
  if (inferred) warnings.push("Année supposée : " + today.slice(0,4) + ". Vérifiez la date.");
  const latest = valid.sort().at(-1) ?? null;
  if (inferred && latest && latest > today) warnings.push("Date future : année à confirmer.");
  return { date: latest, warnings, multiple: valid.length > 1 };
}
export function captureClientWarnings(draft: DirectClientDraft) {
  const warnings: string[] = [];
  try { parseDirectClient(draft); } catch (e) { warnings.push(e instanceof Error ? e.message : "Coordonnées à vérifier."); }
  if (draft.phone && (normalizedDirectPhone(draft.phone).length !== 10 || !/^\+?[\d () .-]{7,30}$/.test(draft.phone))) warnings.push("Téléphone à vérifier.");
  if (draft.email && /(?:hotrnail|grnail|gmai1|out1ook|outiook)\./i.test(draft.email)) warnings.push("Courriel potentiellement mal lu : à vérifier.");
  return warnings;
}
function mergeNotes(a: string | null, b: string | null) { return [...new Set([a,b].filter(Boolean))].join(" · ") || null; }
type CaptureColumn = 'name'|'phone'|'email'|'source'|'date'|'note'|'visit';
const columnAliases:Record<CaptureColumn,string[]>={
  name:['nom','client','contact'],phone:['telephone','tel','cellulaire'],email:['courriel','email','e-mail'],
  source:['provenance','source'],date:['date','date de demande','date demande','recue le','date de reception'],
  note:['nature','nature de la demande','demande','message'],visit:['visite demandee','date de visite','visite','rendez-vous','rdv'],
};
const columnLabel=(text:string)=>normalizedCaptureName(text).replace(/[*_:]+/g,'').replace(/\.$/,'').trim();
function captureColumn(text:string):CaptureColumn|undefined {
  return (Object.keys(columnAliases) as CaptureColumn[]).find(key=>columnAliases[key].includes(columnLabel(text)));
}
const captureCells=(line:string)=>{
  const text=line.trim();
  const inner=text.startsWith('|')&&text.endsWith('|')?text.slice(1,-1).trim():text;
  return inner.split(/\s*\|\s*|\t+|\s{2,}/).map(s=>s.trim());
};
function captureColumns(cells:string[]) {
  const map:Partial<Record<CaptureColumn,number>>={};
  cells.forEach((cell,index)=>{const key=captureColumn(cell);if(key && map[key]===undefined)map[key]=index;});
  return map;
}
const clientColumns=(map:Partial<Record<CaptureColumn,number>>)=>map.name!==undefined&&(map.phone!==undefined||map.email!==undefined);
/** Require a real delimited row with plausible coordinates, not just UI labels. */
export function hasCaptureTable(text:string) {
  let map:Partial<Record<CaptureColumn,number>>={};let count=0;
  for(const line of text.split(/\r?\n/)) {
    const cells=captureCells(line),header=captureColumns(cells);
    if(clientColumns(header)){map=header;count=cells.length;continue;}
    if(!count||cells.length!==count)continue;
    const name=clean(cells[map.name!]);
    const email=map.email===undefined?'':cells[map.email].replace(/\s+/g,'').replace(/[.,;:]+$/,'');
    const phone=map.phone===undefined?'':cells[map.phone];
    if(name&&/[\p{L}]/u.test(name)&&name.length<=200&&
       (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||(normalizedDirectPhone(phone).length===10&&/^\+?[\d () .-]{7,30}$/.test(phone))))return true;
  }
  return false;
}
export function deduplicateCapture(clients: ImportClient[]) {
  const result: ImportClient[] = [];
  for (const client of clients) {
    const found = result.find(row => directClientDuplicates([{...row,id:"capture"}],client).length ||
      (normalizedCaptureName(row.name) === normalizedCaptureName(client.name) &&
       (!row.email || !client.email || row.email.toLowerCase() === client.email.toLowerCase()) &&
       (!row.phone || !client.phone || normalizedDirectPhone(row.phone) === normalizedDirectPhone(client.phone))));
    if (!found) { result.push({ ...client, warnings: [...client.warnings] }); continue; }
    const conflict = (["email","phone"] as const).some(key => found[key] && client[key] &&
      (key === "phone" ? normalizedDirectPhone(found[key]) !== normalizedDirectPhone(client[key]) : found[key]!.toLowerCase() !== client[key]!.toLowerCase()));
    if (conflict || normalizedCaptureName(found.name) !== normalizedCaptureName(client.name)) {
      // Shared family coordinates are not enough to silently discard a person.
      client.warnings.push("Coordonnées partagées : doublon possible dans la capture."); result.push(client); continue;
    }
    found.phone ||= client.phone; found.email ||= client.email; found.source = mergeNotes(found.source,client.source);
    if(found.request_date&&client.request_date&&found.request_date!==client.request_date)found.request_note=mergeNotes(found.request_note,'Dates des demandes : '+[found.request_date,client.request_date].sort().join(', '));
    found.request_date = [found.request_date,client.request_date].filter(Boolean).sort().at(-1) ?? null;
    found.request_note = mergeNotes(found.request_note, client.request_note);
    found.properties=[...(found.properties??[]),...(client.properties??[])].filter((p,i,all)=>all.findIndex(other=>other.address===p.address&&other.listingNumber===p.listingNumber)===i);
    found.warnings = [...new Set([...found.warnings,...client.warnings])];
  }
  return result;
}
/** Text parser accepts delimited tables; OCR geometry produces the same format. */
export function parseCaptureText(text: string, today: string): CaptureResult {
  const clients: ImportClient[] = []; const details: string[][] = []; const warnings: string[] = [];
  let mode: "clients" | "details" | null = null;
  let columns:Partial<Record<CaptureColumn,number>>={};let columnCount=0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); const normal = normalizedCaptureName(line);
    const cells = captureCells(line),header=captureColumns(cells);
    if (clientColumns(header)) { mode = "clients"; columns=header;columnCount=cells.length;continue; }
    if (header.name!==undefined&&header.date!==undefined&&header.note!==undefined) { mode = "details";columns=header;columnCount=cells.length;continue; }
    if (/details des demandes|suivis retrouves/.test(normal)) { mode = null; continue; }
    if (!line || /^[-|:\s]+$/.test(line)) continue;
    if (cells.length !== columnCount) { if (/^(?:resume|conclusion|remarque|note\s*:)/.test(normal)) mode = null; continue; }
    if (mode === "clients") {
      const value=(key:CaptureColumn)=>columns[key]===undefined?'':cells[columns[key]!];
      const name=value('name'),phone=value('phone'),email=value('email'),source=value('source');
      if (!clean(name)) continue;
      const mail = clean(email)?.replace(/\s+/g, "").replace(/[.,;:]+$/, "") ?? null;
      const date=captureDates(value('date'),today);
      const note=mergeNotes(clean(value('note')),clean(value('visit'))?'Visite demandée : '+value('visit'):null);
      const draft = { name, phone: clean(phone), email: mail, source: clean(source), request_date: date.date, request_note: note };
      clients.push({ ...draft, warnings: [...captureClientWarnings(draft),...date.warnings] });
    } else if (mode === "details") details.push([cells[columns.name!],cells[columns.date!],cells[columns.note!]]);
  }
  for (const [name,date,...noteParts] of details) {
    const dateInfo = captureDates(date,today); const note = noteParts.join(" | ").trim();
    const matched = clients.filter(client => normalizedCaptureName(client.name) === normalizedCaptureName(name));
    const detailNote = dateInfo.multiple ? `${note}${note ? " · " : ""}Dates des demandes : ${date}` : note;
    if (matched.length === 1) {
      const client = matched[0];
      if(client.request_date&&dateInfo.date&&client.request_date!==dateInfo.date)client.request_note=mergeNotes(client.request_note,'Dates des demandes : '+[client.request_date,dateInfo.date].sort().join(', '));
      client.request_date = [client.request_date,dateInfo.date].filter(Boolean).sort().at(-1) ?? null;
      client.request_note = mergeNotes(client.request_note,detailNote || null);
      client.warnings.push(...dateInfo.warnings);
    } else if (matched.length === 0) {
      clients.push({ name, phone:null,email:null,source:null,request_date:dateInfo.date,request_note:detailNote || null,
        warnings:["Détails sans coordonnées associées : vérifiez le nom.",...dateInfo.warnings] });
    } else { const warning="Une demande ne peut pas être associée à un nom unique. Vérifiez les lignes portant le même nom."; warnings.push(warning);matched.forEach(client=>client.warnings.push(warning)); }
  }
  if (!clients.length) throw new Error("La capture ne semble pas contenir une liste de clients ChatGPT compatible. Essayez une capture plus nette incluant le tableau complet.");
  if (clients.length > 100) throw new Error("La capture contient trop de lignes. Importez au maximum 100 clients à la fois.");
  return { clients: deduplicateCapture(clients), warnings };
}

export function captureWordsFromTsv(tsv: string): CaptureWord[] {
  return tsv.split("\n").slice(1).flatMap(line => {
    const c=line.split("\t");
    return c[0]==="5" && c[11]?.trim() ? [{text:c.slice(11).join(" ").trim(),x:+c[6],y:+c[7],width:+c[8],height:+c[9],confidence:+c[10]}] : [];
  });
}
/** Spatial columns prevent OCR block order from mixing clients or swapping details. */
function spatialHeader(line:CaptureWord[]) {
  const found:{key:CaptureColumn;text:string;x:number;height:number}[]=[];
  for(let i=0;i<line.length;i++)for(let length=Math.min(4,line.length-i);length>0;length--){
    const text=line.slice(i,i+length).map(w=>w.text).join(' '),key=captureColumn(text);
    if(key){found.push({key,text,x:line[i].x,height:line[i].height});i+=length-1;break;}
  }
  const keys=found.map(c=>c.key);
  return keys.includes('name')&&((keys.includes('phone')||keys.includes('email'))||(keys.includes('date')&&keys.includes('note')))?found:[];
}
export function captureTableText(words: CaptureWord[]) {
  // Find the actual table header before grouping lines: surrounding browser/sidebar
  // text must not become the vertical anchor or the first data column.
  const candidates=words.filter(w=>captureColumn(w.text)==='name').sort((a,b)=>a.y-b.y);
  const start=candidates.map(w=>({word:w,header:spatialHeader(words.filter(other=>Math.abs(other.y+other.height/2-w.y-w.height/2)<Math.max(other.height,w.height)*.8).sort((a,b)=>a.x-b.x))})).find(c=>c.header.length);
  if(!start)return '';
  const left=start.header[0].x;
  const tableWords=words.filter(w=>w.x>=left-10&&w.y+w.height>=start.word.y);
  const sorted = [...tableWords].sort((a,b)=>a.y+a.height/2-b.y-b.height/2);
  const lines: CaptureWord[][] = [];
  for(const word of sorted) {
    const line=lines.at(-1); const anchor=line?.[0];
    if(anchor && Math.abs(word.y+word.height/2-anchor.y-anchor.height/2)<Math.max(word.height,anchor.height)*.6) line!.push(word);
    else lines.push([word]);
  }
  lines.forEach(line=>line.sort((a,b)=>a.x-b.x));
  const output:string[]=[]; let columns:number[]=[]; let type=""; let nameColumn=0; let current:string[]|null=null; let previousY=0; let headerHeight=0;
  const flush=()=>{if(current)output.push('| '+current.join(" | ")+' |');current=null;};
  for(const line of lines) {
    const header=spatialHeader(line);
    if(header.length){flush();columns=header.map(c=>c.x);nameColumn=header.findIndex(c=>c.key==='name');type=header.some(c=>c.key==='phone'||c.key==='email')?'clients':'details';headerHeight=Math.min(...header.map(c=>c.height));output.push(header.map(c=>c.text).join(' | '));continue;}
    const text=normalizedCaptureName(line.map(w=>w.text).join(" "));
    if(/details des demandes|suivis retrouves|liste des clients|clients potentiels|^(?:resume|conclusion|remarque|note\s*:)/.test(text)){flush();columns=[];continue;}
    if(!columns.length)continue;
    const heights=line.map(w=>w.height).sort((a,b)=>a-b);
    if(heights[Math.floor(heights.length/2)]<headerHeight*.8){flush();columns=[];continue;}
    if(current&&line[0].y-previousY>headerHeight*4.5){flush();columns=[];continue;}
    const cells=columns.map(()=>"");
    for(const word of line){let col=0;for(let i=1;i<columns.length;i++)if(word.x+word.width*.15>=columns[i]-Math.max(4,word.height*.35))col=i;cells[col]+=(cells[col]?" ":"")+word.text;}
    const y=line[0].y;
    const continuation=current && (!cells[nameColumn] || (type==="details"&&/-$/.test(current[nameColumn])&&y-previousY<line[0].height*2.5) || (cells.every((c,i)=>i===nameColumn||!c) && y-previousY<line[0].height*1.9));
    if(continuation){cells.forEach((cell,i)=>{if(cell)current![i]+=(current![i]&&!(i===nameColumn&&/-$/.test(current![i]))?" ":"")+cell;});}
    else {flush();current=cells;}
    previousY=y;
    if(type==="clients" && current?.[nameColumn] && current[nameColumn].length>200){flush();columns=[];}
  }
  flush();return output.join("\n");
}
