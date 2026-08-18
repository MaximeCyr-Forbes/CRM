export const CONTACT_BROKERS = ["france", "maxime", "sandrine"] as const;
export const CONTACT_ASSIGNMENTS = [...CONTACT_BROKERS, "unassigned"] as const;

export type ContactBroker = (typeof CONTACT_BROKERS)[number] | "unassigned";
export type ContactSource = "manual" | "csv" | "vcard";
export type ClientType = "buyer" | "seller" | "buyer_seller" | null;
export type ContactPriority = "hot" | "warm" | "cold" | null;
export type ContactStatus = "active" | "inactive";
export type CalendarSyncStatus = "synced" | "pending" | "error";
export const BUYER_PIPELINE_STAGES = [
  "new",
  "qualified",
  "search",
  "visits",
  "offer",
  "conditions",
  "notary",
  "purchased",
  "long_term",
] as const;
export const SELLER_PIPELINE_STAGES = [
  "new",
  "to_contact",
  "evaluation",
  "follow_up",
  "contract_signed",
  "on_market",
  "offer_received",
  "conditions",
  "notary",
  "sold",
  "long_term",
] as const;
export type BuyerPipelineStage = (typeof BUYER_PIPELINE_STAGES)[number];
export type SellerPipelineStage = (typeof SELLER_PIPELINE_STAGES)[number];
export type PipelineType = "buyer" | "seller";
export type PipelineStage = BuyerPipelineStage | SellerPipelineStage;

export type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  apartment: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  broker: ContactBroker;
  clientType: ClientType;
  priority: ContactPriority;
  status: ContactStatus;
  source: ContactSource;
  lastContactDate: string | null;
  nextFollowUpDate: string | null;
  googleCalendarEventId: string | null;
  googleCalendarEventBroker: Exclude<ContactBroker, "unassigned"> | null;
  googleCalendarSyncStatus: CalendarSyncStatus;
  googleCalendarLastError: string | null;
  buyerPipelineStage: BuyerPipelineStage;
  sellerPipelineStage: SellerPipelineStage;
  createdAt: string;
  updatedAt: string;
};

export const CONTACT_DRAFT_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "email",
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
  | "address"
  | "apartment"
  | "city"
  | "province"
  | "postalCode"
  | "country"
  | "broker"
  | "clientType"
  | "priority"
  | "status"
>;

export type DraftMergeSelection = ContactDraft & {
  broker: ContactBroker;
  nextFollowUpDate: string | null;
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

export const BUYER_PIPELINE_LABELS: Record<BuyerPipelineStage, string> = {
  new: "NOUVEAU",
  qualified: "QUALIFIÉ",
  search: "RECHERCHE",
  visits: "VISITES",
  offer: "OFFRE / PA",
  conditions: "CONDITIONS",
  notary: "NOTAIRE",
  purchased: "ACHETÉ",
  long_term: "LONG TERME",
};

export const SELLER_PIPELINE_LABELS: Record<SellerPipelineStage, string> = {
  new: "NOUVEAU",
  to_contact: "À CONTACTER",
  evaluation: "ÉVALUATION",
  follow_up: "SUIVI",
  contract_signed: "CONTRAT SIGNÉ",
  on_market: "EN MARCHÉ",
  offer_received: "OFFRE REÇUE",
  conditions: "CONDITIONS",
  notary: "NOTAIRE",
  sold: "VENDU",
  long_term: "LONG TERME",
};

export function contactBelongsToPipeline(contact: Contact, pipeline: PipelineType) {
  return contact.clientType === pipeline || contact.clientType === "buyer_seller";
}

export const PRIORITY_LABELS: Record<Exclude<ContactPriority, null>, string> = {
  hot: "Chaud",
  warm: "Tiède",
  cold: "Froid",
};

export function getContactName(contact: ContactDraft) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Contact sans nom";
}

export function getContactAddressLines(contact: ContactDraft) {
  const apartment = contact.apartment.trim();
  const apartmentLabel = apartment && !/^(app\.?|apt\.?|appartement|unit[eé]|suite|#)/i.test(apartment)
    ? `app. ${apartment}`
    : apartment;
  const streetLine = [contact.address.trim(), apartmentLabel].filter(Boolean).join(", ");
  const provinceAndPostal = [contact.province.trim(), contact.postalCode.trim()].filter(Boolean).join(" ");
  const localityLine = [contact.city.trim(), provinceAndPostal].filter(Boolean).join(", ");
  return [streetLine, localityLine, contact.country.trim()].filter(Boolean);
}

export function getContactFullAddress(contact: ContactDraft) {
  return getContactAddressLines(contact).join(", ");
}
