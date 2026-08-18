import type {
  ContactAddress,
  ContactAddressInput,
  ContactAddressLabel,
  ContactDraft,
} from "../data/contact-types";

export const ADDRESS_FIELDS = [
  "civicNumber", "address", "apartment", "city", "province", "postalCode", "country",
] as const;

export type AddressFields = Pick<ContactDraft, (typeof ADDRESS_FIELDS)[number]>;

export function hasAddressValue(address: AddressFields) {
  return ADDRESS_FIELDS.some((field) => address[field].trim().length > 0);
}

function normalizeComparisonPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CA")
    .replace(/\bav\.?\b/g, "avenue")
    .replace(/\bboul\.?\b/g, "boulevard")
    .replace(/\bch\.?\b/g, "chemin")
    .replace(/\brte\.?\b/g, "route")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeAddressKey(address: AddressFields) {
  if (!hasAddressValue(address)) return "";
  return ADDRESS_FIELDS.map((field) => {
    const value = field === "postalCode" ? address[field].replace(/\s+/g, "") : address[field];
    return normalizeComparisonPart(value);
  }).join("|");
}

export function addressInputFromDraft(
  draft: ContactDraft,
  options: { isPrimary?: boolean; label?: ContactAddressLabel; id?: string } = {},
): ContactAddressInput | null {
  const fields = Object.fromEntries(
    ADDRESS_FIELDS.map((field) => [field, draft[field].trim().normalize("NFC")]),
  ) as AddressFields;
  if (!hasAddressValue(fields)) return null;
  return {
    ...fields,
    ...(options.id ? { id: options.id } : {}),
    isPrimary: options.isPrimary ?? true,
    label: options.label ?? (options.isPrimary === false ? "Ancienne adresse" : "Principale"),
  };
}

export function primaryAddressFields(addresses: ReadonlyArray<ContactAddressInput>): AddressFields {
  const selected = addresses.find((address) => address.isPrimary) ?? addresses[0];
  return Object.fromEntries(
    ADDRESS_FIELDS.map((field) => [field, selected?.[field] ?? ""]),
  ) as AddressFields;
}

export function dedupeAddresses(
  addresses: ReadonlyArray<ContactAddressInput>,
  preferredPrimaryKey?: string,
): ContactAddressInput[] {
  const byKey = new Map<string, ContactAddressInput>();
  for (const source of addresses) {
    const normalized = Object.fromEntries(
      ADDRESS_FIELDS.map((field) => [field, source[field].trim().normalize("NFC")]),
    ) as AddressFields;
    const key = normalizeAddressKey(normalized);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, { ...source, ...normalized });
  }
  const values = [...byKey.values()];
  const primaryKey = preferredPrimaryKey && byKey.has(preferredPrimaryKey)
    ? preferredPrimaryKey
    : normalizeAddressKey(values.find((item) => item.isPrimary) ?? values[0] ?? emptyAddress());
  return values.map((item) => {
    const isPrimary = normalizeAddressKey(item) === primaryKey;
    return {
      ...item,
      isPrimary,
      label: isPrimary ? "Principale" : item.label === "Principale" ? "Ancienne adresse" : item.label,
    };
  });
}

function emptyAddress(): ContactAddressInput {
  return {
    civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "",
    isPrimary: true, label: "Principale",
  };
}

export function fallbackAddresses(contact: ContactDraft & { id?: string; addresses?: ReadonlyArray<ContactAddress> }) {
  if (contact.addresses && contact.addresses.length > 0) return [...contact.addresses];
  const primary = addressInputFromDraft(contact);
  if (!primary) return [];
  const now = new Date(0).toISOString();
  return [{ ...primary, id: `primary:${contact.id ?? "draft"}`, contactId: contact.id ?? "", createdAt: now, updatedAt: now }];
}

export function mergeAddressCollections(
  existing: ReadonlyArray<ContactAddressInput>,
  incoming: ReadonlyArray<ContactAddressInput>,
) {
  const existingPrimary = existing.find((item) => item.isPrimary);
  return dedupeAddresses(
    [...existing, ...incoming],
    existingPrimary ? normalizeAddressKey(existingPrimary) : undefined,
  );
}

export function setPrimaryAddress(
  addresses: ReadonlyArray<ContactAddressInput>,
  primaryKey: string,
) {
  return dedupeAddresses(addresses, primaryKey);
}

export function isAddressHistoryUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const data = error as { code?: string; message?: string };
  return data.code === "42P01" || data.code === "PGRST205" || data.code === "PGRST202"
    || /contact_addresses|save_contact_addresses|import_contacts_with_addresses|merge_.*_with_addresses/i.test(data.message ?? "");
}
