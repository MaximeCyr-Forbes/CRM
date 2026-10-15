import { directClientDuplicates, normalizedDirectPhone, parseDirectClient, type DirectClient, type DirectClientDraft } from "./direct-clients";

export type ImportClient = DirectClientDraft & { warnings: string[] };
export type CaptureResult = { clients: ImportClient[]; warnings: string[] };
export type CaptureWord = { text: string; x: number; y: number; width: number; height: number; confidence: number };
export const normalizedCaptureName = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g,"'").replace(/\s+/g," ").trim();
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
  if (draft.phone && !/^\+?[\d () .-]{7,30}$/.test(draft.phone)) warnings.push("Téléphone à vérifier.");
  if (draft.email && /(?:hotrnail|grnail|gmai1|out1ook)\./i.test(draft.email)) warnings.push("Courriel potentiellement mal lu : à vérifier.");
  return warnings;
}
function mergeNotes(a: string | null, b: string | null) { return [...new Set([a,b].filter(Boolean))].join(" · ") || null; }
export function deduplicateCapture(clients: ImportClient[]) {
  const result: ImportClient[] = [];
  for (const client of clients) {
    const found = result.find(row => directClientDuplicates([{...row,id:"capture"}],client).length ||
      (normalizedCaptureName(row.name) === normalizedCaptureName(client.name) &&
       (!row.email || !client.email || row.email.toLowerCase() === client.email.toLowerCase()) &&
       (!row.phone || !client.phone || normalizedDirectPhone(row.phone) === normalizedDirectPhone(client.phone))));
    if (!found) { result.push({ ...client, warnings: [...client.warnings] }); continue; }
    const conflict = (["email","phone","source"] as const).some(key => found[key] && client[key] &&
      (key === "phone" ? normalizedDirectPhone(found[key]) !== normalizedDirectPhone(client[key]) : found[key]!.toLowerCase() !== client[key]!.toLowerCase()));
    if (conflict || normalizedCaptureName(found.name) !== normalizedCaptureName(client.name)) {
      // Shared family coordinates are not enough to silently discard a person.
      client.warnings.push("Coordonnées partagées : doublon possible dans la capture."); result.push(client); continue;
    }
    found.phone ||= client.phone; found.email ||= client.email; found.source ||= client.source;
    found.request_date = [found.request_date,client.request_date].filter(Boolean).sort().at(-1) ?? null;
    found.request_note = mergeNotes(found.request_note, client.request_note);
    found.warnings = [...new Set([...found.warnings,...client.warnings])];
  }
  return result;
}
/** Text parser accepts delimited tables; OCR geometry produces the same format. */
export function parseCaptureText(text: string, today: string): CaptureResult {
  const clients: ImportClient[] = []; const details: string[][] = []; const warnings: string[] = [];
  let mode: "clients" | "details" | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); const normal = normalizedCaptureName(line);
    const cells = line.replace(/^\|\s*|\s*\|$/g, "").split(/\s*\|\s*|\t+|\s{2,}/).map(s => s.trim());
    if (/\bnom\b/.test(normal) && /telephone|courriel|email/.test(normal)) { mode = "clients"; continue; }
    if (/\bclient\b/.test(normal) && /\bdate\b/.test(normal) && /nature|demande/.test(normal)) { mode = "details"; continue; }
    if (/details des demandes/.test(normal)) { mode = null; continue; }
    if (!line || /^[-|:\s]+$/.test(line)) continue;
    if (cells.length < (mode === "clients" ? 4 : 3)) { if (/^(?:resume|conclusion|remarque|note\s*:)/.test(normal)) mode = null; continue; }
    if (mode === "clients") {
      const [name,phone,email,source] = cells;
      if (!clean(name)) continue;
      const mail = clean(email)?.replace(/\s+/g, "").replace(/[.,;:]+$/, "") ?? null;
      const draft = { name, phone: clean(phone), email: mail, source: clean(source), request_date: null, request_note: null };
      clients.push({ ...draft, warnings: captureClientWarnings(draft) });
    } else if (mode === "details") details.push(cells);
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
export function captureTableText(words: CaptureWord[]) {
  const sorted = [...words].sort((a,b)=>a.y+a.height/2-b.y-b.height/2);
  const lines: CaptureWord[][] = [];
  for(const word of sorted) {
    const line=lines.at(-1); const anchor=line?.[0];
    if(anchor && Math.abs(word.y+word.height/2-anchor.y-anchor.height/2)<Math.max(word.height,anchor.height)*.6) line!.push(word);
    else lines.push([word]);
  }
  lines.forEach(line=>line.sort((a,b)=>a.x-b.x));
  const output:string[]=[]; let columns:number[]=[]; let type=""; let current:string[]|null=null; let previousY=0;
  const flush=()=>{if(current)output.push(current.join(" | "));current=null;};
  for(const line of lines) {
    const tokens=line.map(w=>normalizedCaptureName(w.text).replace(/[^a-z]/g,""));
    const nominal=tokens.findIndex(t=>t==="nom"), telephone=tokens.findIndex(t=>t==="telephone"), email=tokens.findIndex(t=>t==="courriel"||t==="email"), source=tokens.findIndex(t=>t==="provenance"||t==="source");
    const client=tokens.findIndex(t=>t==="client"), date=tokens.findIndex(t=>t==="date"), nature=tokens.findIndex(t=>t==="nature");
    if(nominal>=0&&telephone>=0&&email>=0&&source>=0) { flush(); columns=[nominal,telephone,email,source].map(i=>line[i].x);type="clients";output.push("Nom | Téléphone | Courriel | Provenance");continue; }
    if(client>=0&&date>=0&&nature>=0){flush();columns=[client,date,nature].map(i=>line[i].x);type="details";output.push("Client | Date | Nature de la demande");continue;}
    const text=normalizedCaptureName(line.map(w=>w.text).join(" "));
    if(/details des demandes|liste des clients|clients potentiels|^(?:resume|conclusion|remarque|note\s*:)/.test(text)){flush();columns=[];continue;}
    if(!columns.length)continue;
    const cells=columns.map(()=>"");
    for(const word of line){let col=0;for(let i=1;i<columns.length;i++)if(word.x+word.width*.15>=columns[i]-Math.max(4,word.height*.35))col=i;cells[col]+=(cells[col]?" ":"")+word.text;}
    const y=line[0].y;
    const continuation=current && (!cells[0] || (cells.slice(1).every(c=>!c) && y-previousY<line[0].height*1.9));
    if(continuation){cells.forEach((cell,i)=>{if(cell)current![i]+=(current![i]?" ":"")+cell;});}
    else {flush();current=cells;}
    previousY=y;
    if(type==="clients" && current?.[0] && current[0].length>200){flush();columns=[];}
  }
  flush();return output.join("\n");
}
