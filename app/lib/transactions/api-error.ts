import type { DatabaseErrorMetadata } from "./optional-listing-links";
import { transactionHistoryConflict } from "./history-protection";

export type TransactionAction = "list" | "create" | "update" | "delete" | "other";

function errorText(error: DatabaseErrorMetadata) {
  return [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
}

export function transactionApiErrorMessage(error: unknown, action: TransactionAction) {
  const historyConflict = transactionHistoryConflict(error);
  if (historyConflict) return historyConflict.message;
  const metadata = error && typeof error === "object" ? error as DatabaseErrorMetadata : {};
  const text = errorText(metadata);
  if (metadata.code === "23503" && (text.includes("contact") || text.includes("transaction_contacts"))) {
    return "Un des contacts liés n’est plus disponible.";
  }
  if (metadata.code === "23514" && text.includes("status")) {
    return "Le statut sélectionné n’est pas accepté.";
  }
  if ((metadata.code === "23502" || metadata.code === "23514") && text.includes("address")) {
    return "L’adresse de la transaction est invalide.";
  }
  if (action === "create") return "La transaction n’a pas pu être créée.";
  if (action === "update") return "La transaction n’a pas pu être modifiée.";
  if (action === "list") return "Impossible de charger les transactions.";
  if (action === "delete") return "La transaction n’a pas pu être supprimée.";
  return "L’opération sur la transaction a échoué.";
}

export function transactionApiErrorStatus(error: unknown) {
  return transactionHistoryConflict(error) ? 409 : 502;
}

export function transactionErrorMetadata(error: unknown, action: string) {
  const metadata = error && typeof error === "object" ? error as DatabaseErrorMetadata : {};
  return {
    action,
    code: metadata.code,
    message: metadata.message,
    details: metadata.details,
    hint: metadata.hint,
  };
}
