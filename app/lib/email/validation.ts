const EMAIL_PATTERN = /^[^\s@<>,;:\"()[\]\\]+@[^\s@<>,;:\"()[\]\\]+\.[^\s@<>,;:\"()[\]\\]+$/;

export type GmailMessageInput = {
  to: string;
  subject: string;
  message: string;
};

export function validateGmailMessage(input: GmailMessageInput): GmailMessageInput {
  if (/[\r\n]/.test(input.to) || /[\r\n]/.test(input.subject)) {
    throw new TypeError("Les retours à la ligne sont interdits dans le destinataire et l’objet.");
  }
  const to = input.to.trim();
  const subject = input.subject.trim();
  const message = input.message;
  if (!EMAIL_PATTERN.test(to) || to.length > 320) throw new TypeError("Adresse courriel invalide.");
  if (!subject || subject.length > 250) throw new TypeError("L’objet doit contenir entre 1 et 250 caractères.");
  if (!message.trim() || message.length > 100_000) throw new TypeError("Le message doit contenir entre 1 et 100 000 caractères.");
  if (/\{\{|\}\}/.test(`${subject}\n${message}`)) throw new TypeError("Variable non résolue.");
  return { to, subject, message };
}

