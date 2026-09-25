import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeExtractedOaciqDocuments as analyze } from "./parser";
import { promise, counter, document } from "./test-fixtures";
import { counterClauses } from "./counter-clauses";
import { analyzeOaciqTransaction } from "../transactions/oaciq-analysis";
import { purchaseAgreementFromAnalysis } from "../purchase-agreement/bundle";
import { confirmedAgenda, proposalsFromAnalysis } from "../transactions/oaciq-agenda";

function cp(number = "20002", accepted = "2026-09-23T15:00:00-04:00") {
  return counter({number,accepted,notary:false,occupation:false});
}
function pa() {
  const doc = promise({counter:"20002",clause12:"Vérification du zonage dans les 30 jours suivant l'acceptation"});
  doc.pages[0].text = doc.pages[0].text.replace("6.2", "4.1 Prix 450000 $\n4.2 Acompte\n6.2");
  return doc;
}
describe("source 1474422 sparse final contract regression", () => {
  it("preserves PA fields with a price-only accepted CP", () => {
    const c=cp(); c.pages[0].text=c.pages[0].text.replace("P2.3.2","P2.3.1 Prix 480000 $\nP2.3.2");
    const a=analyze([pa(),c]);
    expect(a.finalPrice).toBe(480000);
    expect(a.finalContract?.price.overrides[0].value).toBe(450000);
    expect(a.transactionDates.deed_of_sale_date).toBe("2026-11-23");
    expect(a.deadlines.find(d=>d.type==="inspection")?.dueDate).toBe("2026-10-03");
    expect(a.deadlines.filter(d=>d.sourceSection==="9.1")).toHaveLength(2);
    expect(a.deadlines.some(d=>d.sourceSection==="14.1")).toBe(false);
  });
  it.each(["unsigned","refused","unknown","expired"])("does not apply %s CP", kind => {
    const p=promise({date:"2026-09-22"}),c=cp();
    c.pages[0].text=c.pages[0].text.replace("P2.3.2","P2.3.1 Prix 480000 $\nP2.3.2");
    if(kind==="unsigned") c.signatures=[];
    if(kind==="refused") c.annotations[0].text="refuser";
    if(kind==="unknown") c.annotations=[];
    if(kind==="expired") c.pages[0].text=c.pages[0].text.replace("RÉPONSE", "P2.7 22 septembre 2026 20h00\nP3. SIGNATURES\nRÉPONSE");
    const a=analyze([p,c]);
    expect(a.priceSourceForm).not.toBe("CP");
    expect(a.acceptanceDateTime?.slice(0,10)).toBe("2026-09-22");
  });
  it("orders successive accepted siblings by acceptance and preserves sparse changes",()=>{
    const first=cp(),second=cp("20003","2026-09-24T15:00:00-04:00");
    first.pages[0].text=first.pages[0].text.replace("P2.3.2","P2.3.2 6 novembre 2026");
    second.pages[0].text=second.pages[0].text.replace("P2.3.3","P2.3.3 13h30");
    const a=analyze([pa(),first,second]), b=analyze([second,first,pa()]);
    expect(a.transactionDates).toEqual(b.transactionDates);
    expect(a.acceptanceDateTime?.slice(0,10)).toBe("2026-09-24");
    expect(a.transactionDates.deed_of_sale_date).toBe("2026-11-06");
    expect(a.deadlines.find(d=>d.type==="occupancy")).toMatchObject({dueDate:"2026-11-27",dueTime:"13:30"});
  });
  it("cancels a condition and its dependents, while preserving audit",()=>{
    const c=cp();c.pages[0].text=c.pages[0].text.replace("P2.3.4","P2.3.4 La clause 8.1 est annulée. La clause 12.1 est annulée.");
    const a=analyze([pa(),c]);
    expect(a.deadlines.some(d=>["8.1","12.1"].includes(d.sourceSection || ""))).toBe(false);
    expect(a.finalContract?.inspection.overrides).toHaveLength(1);
    expect(a.finalContract?.inspection.value).toBeNull();
  });
  it("moves notary-relative occupancy with an accepted amendment",()=>{
    const p=pa();p.pages[0].text=p.pages[0].text.replace("27 novembre 2026 12h00","à la signature de l'acte de vente");
    const c=cp();c.pages[0].text=c.pages[0].text.replace("P2.3.2","P2.3.2 6 novembre 2026");
    const a=analyze([p,c]);
    expect(a.transactionDates.occupancy_date).toBe("2026-11-06");
    expect(a.finalContract?.notary.overrides[0].value).toBe("2026-11-23");
  });
  it("retains spaced markers and P2.3.4 continuation",()=>{
    expect(counterClauses(["P 2.3.2 6 novembre 2026\nP 2.3.4 Texte\n12.1 clause annulée","P 2.3.4 SUITE\nAutre condition\nP3. SIGNATURES\nSignature"])).toEqual({"P2.3.2":"P 2.3.2 6 novembre 2026","P2.3.4":"P 2.3.4 Texte\n12.1 clause annulée\nP 2.3.4 SUITE\nAutre condition"});
  });
  it("preserves a native CP date and expiry against contradictory visual text",()=>{
    const c=cp();c.pages[0].text=c.pages[0].text.replace("P2.3.2","P2.3.2 6 novembre 2026");
    c.ocrPages=[c.pages[0].text.replace("6 novembre","23 novembre")];
    const a=analyze([pa(),c]);
    expect(a.transactionDates.deed_of_sale_date).toBe("2026-11-06");
    expect(a.warnings.some(w=>w.includes("contradictoires"))).toBe(true);
  });
  it.each([true,false])("applies MO after accepted CP only when accepted and signed: %s",signed=>{
    const c=cp();c.pages[0].text=c.pages[0].text.replace("P2.3.2","P2.3.2 6 novembre 2026");
    const mo=document("MO-30003.pdf","MODIFICATIONS\nMO 30003\nM1. PA 10001\nM2.\nM3.1\nM3.2\nM4. La clause 11.1 est modifiée : 9 novembre 2026\nM5.\nRÉPONSE DU VENDEUR");
    if(signed) {mo.annotations.push({pageIndex:0,text:"accepter",x0:50,x1:80,top:400,bottom:410});mo.signatures.push({field:"seller",name:"",contact:"",reason:"",signedAt:"2026-09-24T10:00:00-04:00"});}
    const a=analyze([mo,c,pa()]);
    expect(a.transactionDates.deed_of_sale_date).toBe(signed ? "2026-11-09" : "2026-11-06");
    if(signed) expect(a.finalContract?.notary.overrides.map(o=>o.value)).toEqual(["2026-11-23","2026-11-06"]);
  });
  it("allows a later signed accepted BO without losing pre-acceptance BO support",()=>{
    const bo=document("BO-40004.pdf","BONIFICATIONS AVANT ACCEPTATION\nBO 40004\nB1. PA 10001\nB2.\nB2.1 Prix 490000 $\nB2.2\nRÉPONSE DU VENDEUR");
    bo.annotations.push({pageIndex:0,text:"accepter",x0:50,x1:80,top:400,bottom:410});
    bo.signatures.push({field:"seller",name:"",contact:"",reason:"",signedAt:"2026-09-24T10:00:00-04:00"});
    expect(analyze([bo,cp(),pa()])).toMatchObject({finalPrice:490000,priceSourceForm:"BO"});
  });
});

// Private documents supplied explicitly at runtime; never copied into fixtures.
it.skipIf(!process.env.OACIQ_PRIVATE_PA || !process.env.OACIQ_PRIVATE_CP)("real source PA/CP parity in transaction and listing",async()=>{
  const inputs=[{name:"PA.pdf",data:new Uint8Array(readFileSync(process.env.OACIQ_PRIVATE_PA!))},{name:"CP.pdf",data:new Uint8Array(readFileSync(process.env.OACIQ_PRIVATE_CP!))}];
  const a=await analyzeOaciqTransaction(inputs);
  const b=await analyzeOaciqTransaction([...inputs].reverse());
  expect(a.transactionDates).toEqual(b.transactionDates);
  expect(a.transactionDates).toMatchObject({deed_of_sale_date:"2026-11-06",occupancy_date:"2026-11-06",inspection_deadline:"2026-10-03",inspection_report_deadline:"2026-10-07",financing_deadline:"2026-10-09"});
  expect(a.buyerNames.length).toBeGreaterThan(0);expect(a.sellerNames.length).toBeGreaterThan(0);
  expect(a.propertyAddress).toBeTruthy();expect(a.priceSourceForm).toBe("CP");
  const listing=purchaseAgreementFromAnalysis(a);
  expect(listing).toMatchObject({recognized:true,buyers:a.buyerNames,sellers:a.sellerNames,amount:a.finalPrice});
  expect(listing.propertyAddress.fullAddress).toBe(a.propertyAddress);
  const agenda=confirmedAgenda(proposalsFromAnalysis(a));
  if (!agenda) throw new Error("Les échéances interprétées doivent former un agenda valide.");
  expect(agenda.some(d=>d.source.section==="P2.3.2" && d.dueDate==="2026-11-06")).toBe(true);
  expect(agenda.some(d=>d.source.section==="14.1")).toBe(false);
},60000);
