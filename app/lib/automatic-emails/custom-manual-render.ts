import type { CustomEmailCampaign, CustomEmailCampaignContact, CustomEmailCampaignStep } from "../../data/custom-email-campaign-types";
import { renderEmailRecipient } from "../email/template";

export function manualSenderBroker(campaign: CustomEmailCampaign, contact: CustomEmailCampaignContact) {
  return campaign.senderStrategy === "fixed_broker" ? campaign.fixedBroker
    : contact.broker === "unassigned" ? campaign.fallbackBroker : contact.broker;
}

export function renderManualRecipient(step: CustomEmailCampaignStep, contact: CustomEmailCampaignContact) {
  return renderEmailRecipient(step.subjectTemplate, step.bodyTemplate, contact);
}
