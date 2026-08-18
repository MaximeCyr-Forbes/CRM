import { CONTACT_DRAFT_FIELDS, type ContactDraft } from "../data/contact-types";

export type DraftMergeSources = Record<keyof ContactDraft, "existing" | "incoming">;

export function getDefaultDraftMergeSources(existing: ContactDraft): DraftMergeSources {
  return Object.fromEntries(
    CONTACT_DRAFT_FIELDS.map((field) => [field, existing[field] ? "existing" : "incoming"]),
  ) as DraftMergeSources;
}

export function mergeContactDraftFields(
  existing: ContactDraft,
  incoming: ContactDraft,
  sources: DraftMergeSources,
): ContactDraft {
  return Object.fromEntries(
    CONTACT_DRAFT_FIELDS.map((field) => [field, sources[field] === "existing" ? existing[field] : incoming[field]]),
  ) as ContactDraft;
}
