export const MAX_INVOICE_SIZE = 15 * 1024 * 1024;
export const CATEGORY_LABELS = { marketing: "Marketing", operation: "Opération" } as const;
export type Category = keyof typeof CATEGORY_LABELS;
export type Invoice = { id: string; file_name: string; mime_type: string; size: number; uploaded_at: string };
export type Expense = { id: string; category: Category; expense_date: string; vendor: string; description: string; amount: number; notes: string; created_by: string; updated_by: string; created_at: string; updated_at: string; invoice: Invoice | null };
export class AccountingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function todayToronto(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export const money = (value: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
export function expenseFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountingError("Dépense invalide.");
  const b = input as Record<string, unknown>;
  if (b.category !== "marketing" && b.category !== "operation") throw new AccountingError("Choisissez Marketing ou Opération.");
  const date = b.expense_date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new AccountingError("Date invalide.");
  const text = (key: string, max: number, optional = false) => {
    const value = b[key] ?? (optional ? "" : null);
    if (typeof value !== "string" || (!optional && !value.trim()) || value.length > max) throw new AccountingError(`Champ ${key} invalide (maximum ${max} caractères).`);
    return value.trim();
  };
  const amount = String(b.amount ?? "").trim().replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) > 9999999999.99) throw new AccountingError("Montant invalide : utilisez un total positif avec au plus deux décimales.");
  return { category: b.category, expense_date: date, vendor: text("vendor", 200), description: text("description", 1000), amount: Number(amount), notes: text("notes", 5000, true) };
}
export function invoiceFields(input: { name: unknown; type: unknown; size: unknown }) {
  const extensions: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 255 || /[\x00-\x1f]/.test(input.name)) throw new AccountingError("Nom de facture invalide.");
  const ext = input.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!extensions[ext] || extensions[ext] !== input.type) throw new AccountingError("Facture refusée : choisissez un PDF, JPEG, PNG ou WEBP.");
  if (typeof input.size !== "number" || !Number.isInteger(input.size) || input.size < 1 || input.size > MAX_INVOICE_SIZE) throw new AccountingError("La facture doit contenir entre 1 octet et 15 Mo.");
  return { file_name: input.name, mime_type: extensions[ext], size: input.size, extension: ext };
}
export function matchesSignature(bytes: Uint8Array, mime: string) {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  return mime === "application/pdf" ? ascii(0, 5) === "%PDF-" : mime === "image/png" ? [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n) : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : mime === "image/webp" && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP";
}
export function validId(value: string) { if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) throw new AccountingError("Identifiant invalide."); return value; }
export type Filters = { category: Category | "all"; period: "month" | "year" | "all"; year: string; search: string };
export function filterExpenses(rows: Expense[], filters: Filters, today = todayToronto()) {
  const needle = filters.search.trim().toLocaleLowerCase("fr-CA");
  return rows.filter(row => (filters.category === "all" || row.category === filters.category)
    && (filters.period === "month" ? row.expense_date.slice(0,7) === today.slice(0,7) : filters.period === "year" ? row.expense_date.startsWith(filters.year + "-") : true)
    && (!needle || [row.vendor, row.description, row.notes, row.invoice?.file_name].some(text => text?.toLocaleLowerCase("fr-CA").includes(needle))))
    .sort((a,b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at));
}
export function expenseTotals(rows: Expense[]) {
  const marketing = rows.filter(r => r.category === "marketing").reduce((n,r) => n + Math.round(Number(r.amount)*100),0);
  const operation = rows.filter(r => r.category === "operation").reduce((n,r) => n + Math.round(Number(r.amount)*100),0);
  return { total: (marketing + operation)/100, marketing: marketing/100, operation: operation/100 };
}
