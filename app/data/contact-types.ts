export const CONTACT_BROKERS = ["france", "maxime", "sandrine"] as const;
export const CONTACT_ASSIGNMENTS = [...CONTACT_BROKERS, "unassigned"] as const;

export type ContactBroker = (typeof CONTACT_BROKERS)[number] | "unassigned";
export type ContactSource = "manual" | "csv" | "vcard";
export type ClientType = "buyer" | "seller" | "buyer_seller" | null;
export const CLIENT_PROVENANCES = ["friend_family", "referral", "prospecting", "confia"] as const;
export type ClientProvenance = (typeof CLIENT_PROVENANCES)[number] | null;
export type ContactPriority = "hot" | "warm" | "cold" | null;
export type ContactStatus = "active" | "inactive";
export type CalendarSyncStatus = "synced" | "pending" | "error";
export const CONTACT_ADDRESS_LABELS = ["Principale", "Ancienne adresse", "Résidence secondaire", "Autre"] as const;
export type ContactAddressLabel = (typeof CONTACT_ADDRESS_LABELS)[number];

export type ContactAddressInput = {
  id?: string;
  civicNumber: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  isPrimary: boolean;
  label: ContactAddressLabel;
};

export type ContactAddress = ContactAddressInput & {
  id: string;
  contactId: string;
  createdAt: string;
  updatedAt: string;
};
export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  mortgageRenewalDate: string;
  civicNumber: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  broker: ContactBroker;
  clientType: ClientType;
  clientProvenance: ClientProvenance;
  priority: ContactPriority;
  status: ContactStatus;
  source: ContactSource;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  googleCalendarEventId: string | null;
  googleCalendarEventBroker: Exclude<ContactBroker, "unassigned"> | null;
  googleCalendarSyncStatus: CalendarSyncStatus;
  googleCalendarLastError: string | null;
  addresses: ContactAddress[];
  createdAt: string;
  updatedAt: string;
};

export const CONTACT_DRAFT_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "birthDate",
  "mortgageRenewalDate",
  "civicNumber",
  "address",
  "apartment",
  "city",
  "province",
  "postalCode",
  "country",
] as const;

export type ContactDraft = Pick<Contact, (typeof CONTACT_DRAFT_FIELDS)[number]>;

export type ContactUpdate = Pick<
  Contact,
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "birthDate"
  | "mortgageRenewalDate"
  | "civicNumber"
  | "address"
  | "apartment"
  | "city"
  | "province"
  | "postalCode"
  | "country"
  | "broker"
  | "clientType"
  | "clientProvenance"
  | "priority"
  | "status"
>;

export type DraftMergeSelection = ContactDraft & {
  broker: ContactBroker;
  clientProvenance: ClientProvenance;
  nextFollowUpDate: string | null;
  addresses?: ContactAddressInput[];
};

export type ContactImportInput = {
  draft: ContactDraft;
  addresses: ContactAddressInput[];
};

export const BROKER_LABELS: Record<ContactBroker, string> = {
  france: "France",
  maxime: "Maxime",
  sandrine: "Sandrine",
  unassigned: "Non attribué",
};

export const CLIENT_TYPE_LABELS: Record<Exclude<ClientType, null>, string> = {
  buyer: "Acheteur",
  seller: "Vendeur",
  buyer_seller: "Acheteur + vendeur",
};

export const CLIENT_PROVENANCE_LABELS: Record<Exclude<ClientProvenance, null>, string> = {
  friend_family: "Ami/famille",
  referral: "Référence",
  prospecting: "Prospection",
  confia: "Confia",
};

export function normalizeClientProvenance(value: unknown): ClientProvenance {
  if (value === null || value === "") return null;
  if (typeof value === "string" && CLIENT_PROVENANCES.includes(value as Exclude<ClientProvenance, null>)) {
    return value as Exclude<ClientProvenance, null>;
  }
  throw new Error("Provenance du client invalide");
}

export const PRIORITY_LABELS: Record<Exclude<ContactPriority, null>, string> = {
  hot: "Chaud",
  warm: "Tiède",
  cold: "Froid",
};

export function getContactName(contact: ContactDraft) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Contact sans nom";
}

type ContactAddressFields = Pick<ContactDraft, "civicNumber" | "address" | "apartment" | "city" | "province" | "postalCode" | "country">;

export function getContactAddressLines(contact: ContactAddressFields) {
  const civicNumber = contact.civicNumber.trim();
  const address = contact.address.trim();
  const apartment = contact.apartment.trim();
  const apartmentLabel = apartment && !/^(app\.?|apt\.?|appartement|unit[eé]|suite|#)/i.test(apartment)
    ? `app. ${apartment}`
    : apartment;
  const addressAlreadyContainsNumber = civicNumber
    && new RegExp(`^${civicNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|,|$)`, "i").test(address);
  const streetAddress = address
    ? [addressAlreadyContainsNumber ? "" : civicNumber, address].filter(Boolean).join(" ")
    : "";
  const streetLine = [streetAddress, apartmentLabel].filter(Boolean).join(", ");
  const provinceAndPostal = [contact.province.trim(), contact.postalCode.trim()].filter(Boolean).join(" ");
  const localityLine = [contact.city.trim(), provinceAndPostal].filter(Boolean).join(", ");
  return [streetLine, localityLine, contact.country.trim()].filter(Boolean);
}

export function getContactFullAddress(contact: ContactAddressFields) {
  return getContactAddressLines(contact).join(", ");
}
