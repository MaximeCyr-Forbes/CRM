export const GOOGLE_ACCOUNT_CHANGE_REQUIRED_STATUS = "account-change-required";

export const GOOGLE_ACCOUNT_CHANGE_REQUIRED_MESSAGE =
  "Le compte Google sélectionné est différent du compte actuellement connecté. Reconnectez-le afin d’autoriser correctement Google Agenda et Gmail.";

export type GoogleOAuthFeedback = {
  type: "message" | "error";
  text: string;
};

export function getGoogleOAuthFeedback(
  capability: "calendar" | "gmail" | "drive",
  status: string | null,
): GoogleOAuthFeedback | null {
  if (status === GOOGLE_ACCOUNT_CHANGE_REQUIRED_STATUS) {
    return { type: "error", text: GOOGLE_ACCOUNT_CHANGE_REQUIRED_MESSAGE };
  }
  if (capability === "calendar") {
    if (status === "connected") return { type: "message", text: "Google Agenda connecté avec succès." };
    if (status === "already-connected") return { type: "message", text: "Ce courtier possède déjà un Google Agenda connecté." };
    if (status === "cancelled") return { type: "message", text: "Connexion Google Agenda annulée." };
    if (status === "error") return { type: "error", text: "La connexion Google Agenda n’a pas pu être terminée." };
    return null;
  }
  if (capability === "drive") {
    if (status === "connected") return { type: "message", text: "Google Drive activé avec succès." };
    if (status === "already-connected") return { type: "message", text: "Google Drive est déjà activé pour ce courtier." };
    if (status === "cancelled") return { type: "message", text: "Activation Google Drive annulée." };
    if (status === "error") return { type: "error", text: "L’activation Google Drive n’a pas pu être terminée." };
    return null;
  }
  if (status === "connected") return { type: "message", text: "Gmail activé avec succès." };
  if (status === "already-connected") return { type: "message", text: "Gmail est déjà activé pour ce courtier." };
  if (status === "cancelled") return { type: "message", text: "Activation Gmail annulée." };
  if (status === "error") return { type: "error", text: "L’activation Gmail n’a pas pu être terminée." };
  return null;
}
