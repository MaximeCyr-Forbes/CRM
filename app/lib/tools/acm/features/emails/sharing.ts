import type { EmailDraft } from "../../types";

export function formatEmailForClipboard(draft: Pick<EmailDraft, "subject" | "body">): string {
  return `Objet : ${draft.subject.trim()}\n\n${draft.body.trim()}`;
}

export function formatEmailBodyForClipboard(draft: Pick<EmailDraft, "body">): string {
  return draft.body.trim();
}

export function createMailtoUrl(draft: Pick<EmailDraft, "email" | "subject" | "body">): string {
  const query = new URLSearchParams({ subject: draft.subject, body: draft.body });
  return `mailto:${encodeURIComponent(draft.email.trim())}?${query.toString()}`;
}
