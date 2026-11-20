import { calculateCustomCampaignOccurrences } from "./custom-campaign-calculations";
import { listGoogleConnectionStatuses } from "../google-calendar/service";
import { getCustomEmailCampaign } from "./custom-campaign-persistence";
import type { CustomEmailCampaignPreview } from "../../data/custom-email-campaign-types";
import { effectiveCampaignRecipients } from "./manual-recipients";

export async function getCustomEmailCampaignPreview(campaignId: string): Promise<CustomEmailCampaignPreview | null> {
  const [bundle, connections] = await Promise.all([getCustomEmailCampaign(campaignId), listGoogleConnectionStatuses()]);
  if (!bundle) return null;
  const recipients = effectiveCampaignRecipients(bundle.contacts, bundle.manualRecipients);
  const occurrences = calculateCustomCampaignOccurrences(bundle.campaign, recipients, bundle.steps, connections);
  return {
    ...bundle,
    contacts: recipients,
    occurrences,
    summary: {
      total: occurrences.length,
      ready: occurrences.filter((item) => item.blockingReasons.length === 0).length,
      blocked: occurrences.filter((item) => item.blockingReasons.length > 0).length,
      contacts: bundle.contacts.length,
      steps: bundle.steps.length,
    },
    simulationOnly: true,
  };
}
