export const MAX_INVOICE_SIZE = 15 * 1024 * 1024;
export const CATEGORY_LABELS = { marketing: "Marketing", operation: "Opération" } as const;
export type Category = keyof typeof CATEGORY_LABELS;
export type Invoice = { id: string; file_name: string; mime_type: string; size: number; uploaded_at: string };
export type Expense = { id: string; category: Category | null; expense_date: string | null; vendor: string | null; description: string | null; amount: number | null; is_paid: boolean; paid_at: string | null; renewal_date: string | null; notes: string; created_by: string; updated_by: string; created_at: string; updated_at: string; invoice: Invoice | null; recurring_rule_id?: string | null; recurring_period?: string | null; recurring_rule?: { active: boolean; day_of_month: number; next_due_date: string } | null };
export class AccountingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function todayToronto(now = new Date()) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export const money = (value: number | null) => value === null ? "À compléter" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(value);
export function expenseFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AccountingError("Dépense invalide.");
  const b = input as Record<string, unknown>;
  const category = b.category === "" || b.category == null ? null : b.category;
  if (category !== null && category !== "marketing" && category !== "operation") throw new AccountingError("Choisissez Marketing ou Opération.");
  const date = (key: string) => {
    const value = b[key];
    if (value == null || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new AccountingError("Date invalide.");
    return value;
  };
  const text = (key: string, max: number) => {
    const value = b[key] ?? "";
    if (typeof value !== "string" || value.length > max) throw new AccountingError(`Champ ${key} invalide (maximum ${max} caractères).`);
    return value.trim() || null;
  };
  const amount = String(b.amount ?? "").trim().replace(",", ".");
  if (amount && (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) > 9999999999.99)) throw new AccountingError("Montant invalide : utilisez un total positif avec au plus deux décimales.");
  return { category, expense_date: date("expense_date"), renewal_date: date("renewal_date"), vendor: text("vendor", 200), description: text("description", 1000), amount: amount ? Number(amount) : null, notes: text("notes", 5000) ?? "" };
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
export type Filters = { category: Category | "all"; period: "month" | "year" | "all" | "undated"; month?: string; year: string; search: string; payment?: "all" | "paid" | "unpaid" };
export function filterExpenses(rows: Expense[], filters: Filters, today = todayToronto()) {
  const needle = filters.search.trim().toLocaleLowerCase("fr-CA");
  return rows.filter(row => (filters.category === "all" || row.category === filters.category)
    && (filters.period === "month" ? row.expense_date?.slice(0,7) === `${filters.year}-${filters.month ?? today.slice(5,7)}` : filters.period === "year" ? row.expense_date?.startsWith(filters.year + "-") : filters.period === "undated" ? !row.expense_date : true)
    && (!filters.payment || filters.payment === "all" || (filters.payment === "paid" ? row.is_paid : !row.is_paid))
    && (!needle || [row.vendor, row.description, row.notes, row.invoice?.file_name].some(text => text?.toLocaleLowerCase("fr-CA").includes(needle))))
    .sort((a,b) => (b.expense_date ?? "").localeCompare(a.expense_date ?? "") || b.created_at.localeCompare(a.created_at));
}
export function expenseTotals(rows: Expense[]) {
  const marketing = rows.filter(r => r.category === "marketing").reduce((n,r) => n + Math.round(Number(r.amount)*100),0);
  const operation = rows.filter(r => r.category === "operation").reduce((n,r) => n + Math.round(Number(r.amount)*100),0);
  return { total: rows.reduce((n,r) => n + Math.round(Number(r.amount)*100),0)/100, marketing: marketing/100, operation: operation/100 };
}

export const MONTH_DATE_REQUIRED = "Choisissez la date de la première occurrence pour activer la récurrence mensuelle.";
export function monthlyIntent(input: Record<string,unknown>, date: string|null) {
  if(input.is_monthly != null && typeof input.is_monthly !== "boolean") throw new AccountingError("Option mensuelle invalide.");
  if(input.is_monthly === true && !date) throw new AccountingError(MONTH_DATE_REQUIRED);
  return input.is_monthly == null ? null : input.is_monthly as boolean;
}
