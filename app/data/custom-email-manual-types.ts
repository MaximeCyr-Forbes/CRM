import type { CalendarBroker } from "./calendar-types";

export type ManualRecipient = {
  recipientId: string;
  contactId: string | null;
  manualRecipientId: string | null;
  name: string;
  to: string;
  broker: CalendarBroker | null;
  senderEmail: string;
  senderName: string;
  subject: string;
  message: string;
  html: string;
  fingerprint: string;
  blockingReasons: string[];
  deliveryStatus: "pending" | "sent" | "failed" | "blocked" | null;
};

export type ManualPreview = {
  campaignId: string;
  campaignName: string;
  stepId: string;
  stepOrder: number;
  recipients: ManualRecipient[];
};

export type ManualHistory = {
  id: string;
  batch_id: string;
  campaign_id: string;
  step_id: string;
  contact_id: string | null;
  manual_recipient_id?: string | null;
  broker: CalendarBroker | null;
  recipient_email: string;
  status: "pending" | "sent" | "failed" | "blocked";
  gmail_message_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
