import type { CmaReportData, EmailDraft, EmailRecipient, EmailTemplateId } from "../../types";
import { generateStandardEmailBody, generateStandardEmailSubject } from "./templates/standard";

export function generateEmailDraft(
  report: CmaReportData,
  recipient: EmailRecipient,
  generatedAt = new Date(),
  template: EmailTemplateId = "standard",
): EmailDraft {
  if (template !== "standard") throw new Error(`Modèle de courriel non pris en charge: ${template}`);
  return {
    ...recipient,
    preparedBy: report.preparedBy,
    template,
    format: "plain_text",
    subject: generateStandardEmailSubject(report),
    body: generateStandardEmailBody(report, recipient),
    generatedAt: generatedAt.toISOString(),
    editedManually: false,
  };
}
