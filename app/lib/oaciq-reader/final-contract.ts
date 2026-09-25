import { extractTimeText, formatDay, timeToIso } from "./dates";
import { clauseAmount, priceClause } from "./price";
import type { OaciqAnalysis, OaciqCounterProposal, OaciqDeadline, OaciqExtractedDocument } from "./types";

/** Sparse contract overrides, matching transaction_engine 1474422.
 * CRM deadline identities and dependent conditions are retained. */
export function applyCounterContract(deadlines: OaciqDeadline[], path: OaciqCounterProposal[], context: {
  occupationAtNotary: boolean;
  modifications: NonNullable<OaciqAnalysis["documentaryState"]>["modifications"];
  documents: OaciqExtractedDocument[];
  main: OaciqExtractedDocument;
  price: Pick<OaciqAnalysis, "finalPrice" | "priceSourceDocument" | "priceSourceSection">;
}): NonNullable<OaciqAnalysis["finalContract"]> {
  const final: NonNullable<OaciqAnalysis["finalContract"]> = {};
  const snapshot = (d: OaciqDeadline) => ({value: d.dueDate ?? d.days, time: d.dueTime, sourceDocument: d.sourceDocument, sourceSection: d.sourceSection});
  for (const d of deadlines) final[d.type] = {...snapshot(d), overrides: []};
  let atNotary = context.occupationAtNotary;
  function patch(type: string, value: string | null, time: string | null, cp: OaciqCounterProposal, section: string) {
    let d = deadlines.find(d => d.type === type);
    if (!d) {
      if (!value) return;
      d = {title: type === "notary" ? "Signature de l'acte de vente chez le notaire" : "Occupation des lieux par l'acheteur", type, dueDate:null,dueTime:null,dateText:"",details:"",sourceDocument:null,sourceForm:null,sourceSection:null,sourceText:null,confidence:"high",baseDate:null,days:null};
      deadlines.push(d);
    }
    const previous = final[type];
    const overrides = previous ? [...previous.overrides, snapshot(d)] : [];
    d.dueDate = value;
    d.dueTime = time;
    d.sourceDocument = cp.fileName; d.sourceForm = cp.formNumber; d.sourceSection = section;
    d.sourceText = cp.clauses?.[section] || null; d.confidence = "high";
    d.dateText = `${value ? formatDay(value) : "À la signature de l'acte de vente"}${time ? ` à ${extractTimeText(time)}` : ""}`;
    final[type] = {...snapshot(d), overrides};
  }
  const basePrice = clauseAmount(priceClause(context.main,"4.1","4.2"));
  final.price = {value:basePrice,sourceDocument:context.main.name,sourceSection:"4.1",overrides:[]};
  for (const cp of path) {
    for (const section of cp.cancelledClauses || []) {
      for (let i=deadlines.length-1;i>=0;i--) if (deadlines[i].sourceSection === section ||
        (section === "11.1" && (deadlines[i].type === "septic_pumping" || (atNotary && deadlines[i].type === "occupancy")))) {
        const d = deadlines[i], previous = final[d.type];
        final[d.type] = {value:null,sourceDocument:cp.fileName,sourceSection:"P2.3.4",overrides:[...(previous?.overrides || []),snapshot(d)]};
        deadlines.splice(i,1);
      }
    }
    if (cp.notaryDate) patch("notary",cp.notaryDate,null,cp,"P2.3.2");
    if (cp.occupationDate || cp.occupationAtNotary) {
      atNotary = !!cp.occupationAtNotary && !cp.occupationDate;
      patch("occupancy",cp.occupationDate || deadlines.find(d=>d.type==="notary")?.dueDate || null,timeToIso(cp.occupationTime),cp,"P2.3.3");
    } else if (cp.occupationTime) {
      patch("occupancy",deadlines.find(d=>d.type==="occupancy")?.dueDate || null,timeToIso(cp.occupationTime),cp,"P2.3.3");
    }
    const amount = clauseAmount(cp.clauses?.["P2.3.1"] || "");
    if (amount !== null) {
      const {overrides,...old} = final.price;
      final.price = {value:amount,sourceDocument:cp.fileName,sourceSection:"P2.3.1",overrides:[...overrides,old]};
    }
  }
  // A later applicable MO wins over CP dates; never reapply the CP afterward.
  for (const m of context.modifications) {
    const type = ["11.1","P2.3.2"].includes(m.section) ? "notary" : ["11.2","P2.3.3"].includes(m.section) ? "occupancy" : null;
    const d = deadlines.find(d=>d.type===type);
    if (d && m.date) {
      const previous = final[d.type];
      if (d.sourceDocument !== m.document) previous.overrides.push(snapshot(d));
      Object.assign(d,{dueDate:m.date,dueTime:m.time,sourceDocument:m.document,sourceForm:m.formNumber,sourceSection:m.section,sourceText:m.text,dateText:formatDay(m.date)});
      final[d.type] = {...snapshot(d),overrides:previous.overrides}; m.applied=true;
      if (type === "occupancy") atNotary=false;
    }
  }
  const notary = deadlines.find(d=>d.type==="notary");
  for (const d of deadlines) if ((d.type==="occupancy" && atNotary) || d.type==="septic_pumping") {
    d.dueDate=notary?.dueDate || null;
    d.dateText=d.dueDate ? `${formatDay(d.dueDate)}${d.dueTime ? ` à ${d.dueTime}` : ""}` : "À la signature de l'acte de vente";
    final[d.type]={...snapshot(d),overrides:final[d.type]?.overrides || []};
  }
  if (final.price.sourceDocument !== context.price.priceSourceDocument && context.price.finalPrice !== null) {
    const {overrides,...previous}=final.price;
    final.price.overrides=[...overrides,previous];
  }
  Object.assign(final.price,{value:context.price.finalPrice,sourceDocument:context.price.priceSourceDocument,sourceSection:context.price.priceSourceSection});
  return final;
}
