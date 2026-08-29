export const CONTACTS_PER_PAGE = 50;

export type ContactsPaginationItem = number | "ellipsis-left" | "ellipsis-right";

export function parseContactsPage(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

export function getContactsTotalPages(contactCount: number) {
  return Math.max(1, Math.ceil(Math.max(0, contactCount) / CONTACTS_PER_PAGE));
}

export function clampContactsPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

export function paginateContacts<T>(contacts: ReadonlyArray<T>, page: number) {
  const totalPages = getContactsTotalPages(contacts.length);
  const currentPage = clampContactsPage(page, totalPages);
  const pageStart = (currentPage - 1) * CONTACTS_PER_PAGE;
  return {
    currentPage,
    pageStart,
    totalPages,
    contacts: contacts.slice(pageStart, pageStart + CONTACTS_PER_PAGE),
  };
}

export function getContactsPaginationItems(currentPage: number, totalPages: number): ContactsPaginationItem[] {
  const lastPage = Math.max(1, totalPages);
  if (lastPage <= 7) return Array.from({ length: lastPage }, (_, index) => index + 1);

  const pages = new Set([1, lastPage]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page > 1 && page < lastPage) pages.add(page);
  }
  const sorted = [...pages].sort((first, second) => first - second);
  const items: ContactsPaginationItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && page - previous > 1) {
      items.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    }
    items.push(page);
  });
  return items;
}

export function contactsListHref(currentQuery: string, updates: Record<string, string | null>) {
  const params = new URLSearchParams(currentQuery);
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  });
  const query = params.toString();
  return query ? `/contacts?${query}` : "/contacts";
}

export function buildContactReturnTo(currentQuery: string, currentPage: number, contactId: string) {
  const listHref = contactsListHref(currentQuery, { page: String(currentPage) });
  return `${listHref}#contact-${encodeURIComponent(contactId)}`;
}

export function buildContactProfileHref(contactId: string, returnTo: string) {
  return `/contacts/${encodeURIComponent(contactId)}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function safeContactReturnTo(value: string | null) {
  if (!value || !/^\/contacts(?:[?#]|$)/.test(value)) return "/contacts";
  try {
    const parsed = new URL(value, "https://crm.local");
    if (parsed.origin !== "https://crm.local" || parsed.pathname !== "/contacts") return "/contacts";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/contacts";
  }
}
