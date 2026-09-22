import { expect, it } from "vitest";
import { isPurchaseAnniversary } from "./model";
import { calculateAutomaticEmailOccurrences, type AutomaticEmailPreviewDataset } from "../automatic-emails/calculations";
import type { AutomaticEmailRule } from "../../data/automatic-email-types";
it("observes February 29 on February 28 only in non-leap years", () => {
  const transaction={id:"p",type:"purchase",address:"Exemple",notary_date:"2024-02-29",purchase_finalized_at:"2024-02-29"};
  expect(isPurchaseAnniversary(transaction,"2025-02-28")).toBe(true);
  expect(isPurchaseAnniversary(transaction,"2028-02-28")).toBe(false);
  expect(isPurchaseAnniversary(transaction,"2028-02-29")).toBe(true);
});
it("simulation includes every linked contact, excludes purchase year, and deduplicates links", () => {
  const rule={ id:"r",ruleType:"purchase_anniversary",name:"Achat",defaultBroker:"maxime",subjectTemplate:"{{firstName}}",bodyTemplate:"{{purchaseDate}}",sendHour:17,sendMinute:0,timezone:"America/Toronto",triggerConfig:{} } as AutomaticEmailRule;
  const dataset:AutomaticEmailPreviewDataset={contacts:["one","two"].map(id=>({id,firstName:id,lastName:"Exemple",email:`${id}@example.test`,broker:"maxime",birthDate:null,mortgageRenewalDate:null})),transactions:[{id:"p",type:"purchase",address:"Exemple",status:"completed",notaryDate:"2024-02-29",purchaseFinalizedAt:"2024-02-29",saleFinalizedAt:null}],transactionContacts:["one","two","two"].map(contactId=>({transactionId:"p",contactId})),connections:[]};
  expect(calculateAutomaticEmailOccurrences([rule],dataset,"2024-02-29","2024-02-29")).toHaveLength(0);
  const rows=calculateAutomaticEmailOccurrences([rule],dataset,"2025-02-28","2025-02-28");
  expect(rows).toHaveLength(2); expect(new Set(rows.map(r=>r.occurrenceKey)).size).toBe(2);
});
