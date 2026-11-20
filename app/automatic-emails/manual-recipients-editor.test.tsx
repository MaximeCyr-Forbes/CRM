// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import ManualRecipientsEditor from "./manual-recipients-editor";
import type { CampaignManualRecipient } from "../lib/automatic-emails/manual-recipients";
import type { CustomEmailCampaignDraft } from "../data/custom-email-campaign-types";
const campaign = { senderStrategy: "fixed_broker", fixedBroker: "france" } as CustomEmailCampaignDraft;
const steps=[{subjectTemplate:"Information",bodyTemplate:"Bonjour {{email}}",delayDaysAfterPrevious:0}];
function Harness() {
  const [recipients,onChange]=useState<CampaignManualRecipient[]>([]);
  return <ManualRecipientsEditor recipients={recipients} onChange={onChange} contacts={[]} campaign={campaign} steps={steps} disabled={false}/>;
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("adds five addresses, reports invalid and duplicate inputs, edits names and removes without network",()=>{
  const network=vi.fn(()=>{throw Error("Network forbidden");}); vi.stubGlobal("fetch",network);
  render(<Harness/>);
  fireEvent.change(screen.getByLabelText("Ajouter une ou plusieurs adresses courriel"),{target:{value:"one@example.test,two@example.test;three@example.test\nfour@example.test\nfive@example.test;ONE@example.test;invalid"}});
  fireEvent.click(screen.getByRole("button",{name:"+ AJOUTER LES ADRESSES"}));
  expect(screen.getByRole("status").textContent).toContain("5 adresse(s) ajoutée(s). 1 doublon(s) ignoré(s). 1 adresse(s) invalide(s)");
  expect((screen.getByLabelText("Ajouter une ou plusieurs adresses courriel") as HTMLTextAreaElement).value).toBe("invalid");
  expect(screen.getAllByRole("group")).toHaveLength(5);
  fireEvent.change(screen.getAllByLabelText("Prénom (facultatif)")[0],{target:{value:"Marie"}});
  expect((screen.getAllByLabelText("Prénom (facultatif)")[0] as HTMLInputElement).value).toBe("Marie");
  fireEvent.change(screen.getByLabelText("Courriel one@example.test"),{target:{value:"changed@example.test"}});
  expect(screen.getByLabelText("Courriel changed@example.test")).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button",{name:"RETIRER"})[0]);
  expect(screen.getAllByRole("group")).toHaveLength(4); expect(network).not.toHaveBeenCalled();
});
