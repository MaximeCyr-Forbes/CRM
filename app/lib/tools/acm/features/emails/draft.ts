import type { EmailDraft, EmailRecipient, ReportPreparerId } from "../../types";
import { getReportPreparer, REPORT_PREPARERS } from "@/app/lib/tools/acm/features/analysis/preparers";

export function createEmptyEmailDraft(recipient: Partial<EmailRecipient> = {}): EmailDraft {
  return {
    template: "standard",
    format: "plain_text",
    firstName: recipient.firstName ?? "",
    lastName: recipient.lastName ?? "",
    email: recipient.email ?? "",
    subject: "",
    body: "",
    editedManually: false,
  };
}

export function isEmailContentModified(draft: EmailDraft, subject: string, body: string): boolean {
  return draft.subject !== subject || draft.body !== body;
}

export function updateEmailDraftPreparer(draft: EmailDraft, preparedBy: ReportPreparerId): EmailDraft {
  if (!draft.generatedAt) return draft;
  const previous = draft.preparedBy
    ? getReportPreparer(draft.preparedBy)
    : REPORT_PREPARERS.find((candidate) => draft.body.includes(candidate.emailSignatureLines.join("\n")));
  const next = getReportPreparer(preparedBy);
  const previousSignature = previous?.emailSignatureLines.join("\n");
  return {
    ...draft,
    preparedBy,
    body: previousSignature && draft.body.includes(previousSignature)
      ? draft.body.replace(previousSignature, next.emailSignatureLines.join("\n"))
      : draft.body,
  };
}
