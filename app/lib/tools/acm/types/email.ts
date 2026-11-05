export type EmailTemplateId = "standard";

export interface EmailRecipient {
  firstName: string;
  lastName: string;
  email: string;
}

export interface EmailDraft extends EmailRecipient {
  preparedBy?: import("./analysis").ReportPreparerId;
  template: EmailTemplateId;
  format: "plain_text";
  subject: string;
  body: string;
  generatedAt?: string;
  editedManually: boolean;
}
