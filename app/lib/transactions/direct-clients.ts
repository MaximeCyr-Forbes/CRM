export const DIRECT_CLIENT_SOURCES = ["Centris", "RE/MAX", "REALTOR.ca", "Autre"] as const;
export type DirectClientDraft = {
  name: string; phone: string | null; email: string | null; source: string | null;
  request_date: string | null; request_note: string | null;
};
export type DirectClient = DirectClientDraft & {
  id: string; transaction_id: string; created_at: string; created_by: string;
  updated_at: string; updated_by: string;
};
export class DirectClientError extends Error {
  constructor(message: string, public status = 400, public duplicates?: DirectClient[]) { super(message); }
}
export function directClientId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new DirectClientError("Identifiant invalide.");
  return value;
}
export function parseDirectClient(value: unknown): DirectClientDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DirectClientError("Client invalide.");
  const body = value as Record<string, unknown>;
  function field(key: string, max: number) {
    const value = body[key];
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new DirectClientError("Champ invalide ou trop long.");
    return value.trim() || null;
  }
  const name = field("name", 200);
  if (!name) throw new DirectClientError("Le nom est requis.");
  const email = field("email", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DirectClientError("Courriel invalide.");
  const date = field("request_date", 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new DirectClientError("Date invalide.");
  return { name, email, phone: field("phone", 80), source: field("source", 80), request_date: date, request_note: field("request_note", 4000) };
}
export function normalizedDirectPhone(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}
export function directClientDuplicates<T extends Pick<DirectClient, "id" | "email" | "phone">>(rows: T[], draft: DirectClientDraft, excludeId?: string) {
  const email = draft.email?.trim().toLowerCase();
  const phone = normalizedDirectPhone(draft.phone);
  return rows.filter(row => row.id !== excludeId && (
    (email && row.email?.trim().toLowerCase() === email) ||
    (phone && normalizedDirectPhone(row.phone) === phone)
  ));
}
export function directClientToday(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
