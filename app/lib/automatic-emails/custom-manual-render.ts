import type { CustomEmailCampaign, CustomEmailCampaignContact, CustomEmailCampaignStep } from "../../data/custom-email-campaign-types";
import { validateGmailMessage } from "../google-gmail/service";
import { resolveCustomEmailTemplate } from "./custom-campaign-calculations";

export function manualSenderBroker(campaign: CustomEmailCampaign, contact: CustomEmailCampaignContact) {
  return campaign.senderStrategy === "fixed_broker" ? campaign.fixedBroker
    : contact.broker === "unassigned" ? campaign.fallbackBroker : contact.broker;
}

export function renderManualRecipient(step: CustomEmailCampaignStep, contact: CustomEmailCampaignContact) {
  const subject = resolveCustomEmailTemplate(step.subjectTemplate, contact);
  const message = resolveCustomEmailTemplate(step.bodyTemplate, contact);
  const to = (contact.email ?? "").trim();
  const blockingReasons: string[] = [];
  const template = `${step.subjectTemplate}\n${step.bodyTemplate}`;
  if (/\{\{\s*firstName\s*\}\}/.test(template) && !(contact.firstName ?? "").trim()) blockingReasons.push("Prénom manquant.");
  if (/\{\{|\}\}/.test(`${subject}\n${message}`)) blockingReasons.push("Variable non résolue.");
  try { validateGmailMessage({ to, subject, message }); }
  catch (error) { blockingReasons.push(error instanceof Error ? error.message : "Courriel invalide."); }
  return { to, subject, message, blockingReasons };
}
