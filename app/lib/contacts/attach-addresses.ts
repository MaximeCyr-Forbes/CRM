export const CONTACT_ADDRESS_BATCH_SIZE = 150;

type ContactRow = Record<string, unknown> & { id: unknown };
type AddressRow = Record<string, unknown> & { contact_id: unknown };
type AddressBatchLoader<TAddress extends AddressRow> = (
  contactIds: ReadonlyArray<string>,
) => Promise<ReadonlyArray<TAddress>>;

export async function attachAddressesInBatches<
  TContact extends ContactRow,
  TAddress extends AddressRow,
>(
  rows: ReadonlyArray<TContact>,
  loadAddressBatch: AddressBatchLoader<TAddress>,
  batchSize = CONTACT_ADDRESS_BATCH_SIZE,
) {
  if (rows.length === 0) return [] as Array<TContact & { contact_addresses: TAddress[] }>;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("La taille des lots d’adresses doit être un entier positif.");
  }

  const contactIds = rows.map((row) => String(row.id));
  const batches: string[][] = [];
  for (let index = 0; index < contactIds.length; index += batchSize) {
    batches.push(contactIds.slice(index, index + batchSize));
  }

  const addressBatches = await Promise.all(
    batches.map((batch) => loadAddressBatch(batch)),
  );
  const addressesByContact = new Map<string, TAddress[]>();
  for (const address of addressBatches.flat()) {
    const contactId = String(address.contact_id);
    addressesByContact.set(contactId, [
      ...(addressesByContact.get(contactId) ?? []),
      address,
    ]);
  }

  return rows.map((row) => ({
    ...row,
    contact_addresses: addressesByContact.get(String(row.id)) ?? [],
  }));
}

export async function attachAddressesWithFallback<
  TContact extends ContactRow,
  TAddress extends AddressRow,
>(
  rows: ReadonlyArray<TContact>,
  loadAddressBatch: AddressBatchLoader<TAddress>,
  onError: (error: unknown) => void,
) {
  try {
    return await attachAddressesInBatches(rows, loadAddressBatch);
  } catch (error) {
    onError(error);
    return [...rows];
  }
}
