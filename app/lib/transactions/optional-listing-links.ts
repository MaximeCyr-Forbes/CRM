export type DatabaseErrorMetadata = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

function errorText(error: DatabaseErrorMetadata) {
  return [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
}

export function isOptionalListingLinksUnavailableError(error: DatabaseErrorMetadata) {
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  const text = errorText(error);
  const mentionsListingLinks = text.includes("listing_transaction_links");
  const unavailableRelation =
    text.includes("schema cache") ||
    text.includes("could not find the table") ||
    text.includes("does not exist") ||
    text.includes("relation") && text.includes("not found");
  return mentionsListingLinks && unavailableRelation;
}

export function optionalListingLinkRows<T>(
  result: { data: T[] | null; error: DatabaseErrorMetadata | null },
  warn: (message: string, metadata: DatabaseErrorMetadata) => void = console.warn,
) {
  if (!result.error) return result.data ?? [];
  if (!isOptionalListingLinksUnavailableError(result.error)) throw result.error;
  warn("Relation listing_transaction_links indisponible; chargement des transactions sans source Listing.", {
    code: result.error.code,
    message: result.error.message,
  });
  return [];
}
