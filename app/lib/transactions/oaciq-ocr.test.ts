import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { analyzeOaciqTransaction } from "./oaciq-analysis";
import { parseOaciqOcr, OACIQ_OCR_LIMITS } from "./oaciq-ocr";
import { proposalsFromAnalysis, recalculateDeadlinesFromAcceptanceDate, MANUAL_DEADLINE_SOURCE } from "./oaciq-agenda";
import { extractOaciqPdf } from "../oaciq-reader/pdf";

// Synthetic image-only PDFs reproduce the lost text layer of signed exports.
// No real document, address, form number, party or signature is stored here.
async function raster(name: string, text?: string) {
  const pdf = await PDFDocument.create(); const page=pdf.addPage([612,792]);
  const image=await pdf.embedPng(Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=","base64")));
  page.drawImage(image,{x:0,y:0,width:612,height:792});
  return {name,data:await pdf.save(),...(text?{ocrPages:[text]}:{})};
}
const pa="PROMESSE D'ACHAT\nPA 10001\n6.2 Dans les 15 jours suivant l'acceptation\n6.3\n8.1 Dans les 10 jours suivant l'acceptation\n9.1\n11.1 Acte de vente le 3 décembre 2026\n11.2 Occupation le 5 décembre 2026\n12.1";
const cp="CONTRE-PROPOSITION\nCP 20002\nP2.1 Promesse d'achat PA 10001\nP2.2\nRÉPONSE DU RÉPONDANT";
const ar="ANNEXE R\nAR 30003\nR1.1 Promesse d'achat PA 10001\nR2.1 non cochée";
describe("signed raster transaction documents",()=>{
 it("reproduces OCR-required failure before supplying the visual text",async()=>{
  await expect(extractOaciqPdf(await raster("arbitrary.pdf"))).rejects.toThrow("OCR");
 });
 it.each([[pa],[pa,cp],[pa,ar],[pa,cp,ar]])("recognizes content with arbitrary filenames: %j",async(...texts)=>{
  const inputs=await Promise.all(texts.map((t,i)=>raster(`document-${i}.pdf`,t)));
  const result=await analyzeOaciqTransaction(inputs);
  expect(result.forms.map(f=>f.kind)).toEqual(texts.map(t=>t===pa?"promise_to_purchase":t===cp?"counter_proposal":"annex_r"));
  expect(result.documents.every(d=>d.ocrUsed)).toBe(true);
  expect(result.requiresReview).toBe(true);
  expect(proposalsFromAnalysis(result).every(p=>!p.selected)).toBe(true);
  expect(result.acceptanceDateTime).toBeNull();
  expect(result.deadlines.find(d=>d.type==="financing")).toMatchObject({days:15,dueDate:null});
  expect(result.deadlines.find(d=>d.type==="inspection")).toMatchObject({days:10,dueDate:null});
 });
 it("isolates a broken document and logs only technical metadata",async()=>{
  const log=vi.spyOn(console,"warn").mockImplementation(()=>{});
  try {
   const result=await analyzeOaciqTransaction([await raster("document.pdf",pa),{name:"PRIVATE-NAME.pdf",data:new Uint8Array([1,2])}]);
   expect(result.forms).toHaveLength(1);expect(result.warnings.join(" ")).toContain("PRIVATE-NAME.pdf");
   expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
   expect(log).toHaveBeenCalledWith("oaciq.analysis.failure",{stage:"extraction",code:"PDF_INVALID",index:1,bytes:2});
  } finally {log.mockRestore();}
 });
 it("never treats an unknown document as a promise",async()=>{
  const result=await analyzeOaciqTransaction([await raster("PA-10001.pdf","Rapport inconnu\n6.2 dans les 42 jours suivant acceptation")]);
  expect(result.forms[0].kind).toBe("unknown");expect(result.deadlines).toEqual([]);expect(result.mainDocument).toBe("");
 });
 it("recalculates reviewed relative dates without replacing a manual deadline",async()=>{
  const result=await analyzeOaciqTransaction([await raster("upload.pdf",pa)]);
  const manual={id:"manual",title:"Date conservée",dueDate:"2027-02-03",dueTime:"17:00",selected:true,source:MANUAL_DEADLINE_SOURCE};
  const proposals=recalculateDeadlinesFromAcceptanceDate([manual,...proposalsFromAnalysis(result)],"2026-09-15");
  expect(proposals[0]).toEqual(manual);
  expect(proposals.find(p=>p.source.section==="6.2")?.dueDate).toBe("2026-09-30");
  expect(proposals.find(p=>p.title.includes("faire une inspection"))?.dueDate).toBe("2026-09-25");
 });
 it("does not replace explicit occupancy with notary text from the following OCR clause",async()=>{
  const result=await analyzeOaciqTransaction([await raster("document.pdf",pa+"\nLECTURE CIBLÉE 11.2\n11.2 Occupation le 5 décembre 2026\n11.3 Répartitions à la date de signature de l'acte de vente")]);
  expect(result.deadlines.find(d=>d.type==="notary")?.dueDate).toBe("2026-12-03");
  expect(result.deadlines.find(d=>d.type==="occupancy")?.dueDate).toBe("2026-12-05");
 });
 it("requires matching page geometry and preserves original PDF bytes",async()=>{
  const input=await raster("upload.pdf",pa),before=input.data.slice();
  const d=await extractOaciqPdf({...input,ocrWords:[[{text:"PA",x0:40,top:20}]]});
  expect(d.pages[0].words).toEqual([{text:"PA",x0:40,top:20}]);expect(input.data).toEqual(before);
  await expect(extractOaciqPdf({...input,ocrWords:[]})).rejects.toThrow("correspondent");
 });
});
describe("bounded visual extraction transport",()=>{
 it("accepts indexed pages and finite PDF coordinates",()=>{
  expect(parseOaciqOcr(JSON.stringify([{index:0,pages:[pa],words:[[["PA",1,2,3,4]]]}]),1)).toHaveLength(1);
 });
 it.each(["{",JSON.stringify([{index:2,pages:[pa]}]),JSON.stringify([{index:0,pages:[pa]},{index:0,pages:[pa]}]),JSON.stringify([{index:0,pages:[]}]),JSON.stringify([{index:0,pages:[pa],words:[[["PA",-1,2,3,4]]]}]),JSON.stringify([{index:0,pages:Array(151).fill("x")}]),"x".repeat(OACIQ_OCR_LIMITS.bytes+1)])("rejects invalid or oversized OCR",value=>{
  expect(()=>parseOaciqOcr(value,2)).toThrow();
 });
});
