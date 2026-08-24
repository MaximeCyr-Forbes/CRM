export function automaticEmailsEnabled() {
  return process.env.AUTOMATIC_EMAILS_ENABLED === "true";
}

export const AUTOMATIC_EMAIL_RUNNER_AVAILABLE = false as const;
