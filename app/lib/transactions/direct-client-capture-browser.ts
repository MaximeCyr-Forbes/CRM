import { captureClientWarnings, captureTableText, captureWordsFromTsv, normalizedCaptureName, parseCaptureText, type CaptureResult } from "./direct-client-capture";
export const CAPTURE_MAX_BYTES = 12 * 1024 * 1024;
export async function validateCaptureFile(file: File) {
  if (file.size > CAPTURE_MAX_BYTES) throw new Error("Capture trop volumineuse. Maximum : 12 Mo.");
  const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71;
  const jpg=b[0]===255&&b[1]===216&&b[2]===255;
  const webp=String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
  if(!png&&!jpg&&!webp)throw new Error("Choisissez une image PNG, JPG ou WEBP.");
}
export async function readClientCapture(file: File, today: string, options: {signal: AbortSignal;onProgress:(message:string)=>void}): Promise<CaptureResult> {
  await validateCaptureFile(file);options.signal.throwIfAborted();
  const moduleUrl=new URL('/direct-clients/ocr.js',window.location.origin).href;
  const engine=await import(/* @vite-ignore */ moduleUrl) as {recognizeCapture:(file:File,options:{signal:AbortSignal;onProgress:(message:string)=>void})=>Promise<{text:string;tsv:string;confidence:number}>};
  let abortListener: (()=>void)|undefined;
  const result=await Promise.race([engine.recognizeCapture(file,options),new Promise<never>((_,reject)=>{
    abortListener=()=>reject(new DOMException('Lecture interrompue','AbortError'));
    options.signal.addEventListener('abort',abortListener,{once:true});
    if(options.signal.aborted)abortListener();
  })]).finally(()=>{if(abortListener)options.signal.removeEventListener('abort',abortListener);});
  options.signal.throwIfAborted();
  options.onProgress('Extraction des clients…');
  const words=captureWordsFromTsv(result.tsv);
  const text=captureTableText(words);
  const parsed=parseCaptureText(text,today);
  const uncertain=words.filter(word=>word.confidence>=0&&word.confidence<55).map(word=>normalizedCaptureName(word.text));
  for(const client of parsed.clients){
    if(result.confidence<65 || uncertain.some(word=>word.length>2&&(normalizedCaptureName(client.name).includes(word)||normalizedCaptureName(client.email??'').includes(word))))client.warnings.push('Lecture incertaine : vérifiez les coordonnées.');
    client.warnings=[...new Set([...client.warnings,...captureClientWarnings(client)])];
  }
  return parsed;
}
