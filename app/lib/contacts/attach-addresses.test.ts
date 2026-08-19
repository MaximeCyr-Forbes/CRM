import { describe, expect, it, vi } from "vitest";
import {
  CONTACT_ADDRESS_BATCH_SIZE,
  attachAddressesInBatches,
  attachAddressesWithFallback,
} from "./attach-addresses";

function contacts(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `contact-${index + 1}`,
    first_name: `Contact ${index + 1}`,
  }));
}

describe("chargement batch de l’historique des adresses", () => {
  it.each([
    [702, 5],
    [1000, 7],
    [2000, 14],
  ])("rattache les adresses de %i contacts en %i lots maximum de 150", async (contactCount, expectedCalls) => {
    const rows = contacts(contactCount);
    const receivedBatches: string[][] = [];
    const loadBatch = vi.fn(async (contactIds: ReadonlyArray<string>) => {
      receivedBatches.push([...contactIds]);
      return contactIds.flatMap((contactId, index) => index % 3 === 0
        ? [
            { id: `primary-${contactId}`, contact_id: contactId, address: "Adresse principale" },
            { id: `old-${contactId}`, contact_id: contactId, address: "Ancienne adresse" },
          ]
        : []);
    });

    const result = await attachAddressesInBatches(rows, loadBatch);

    expect(result).toHaveLength(contactCount);
    expect(loadBatch).toHaveBeenCalledTimes(expectedCalls);
    expect(receivedBatches.every((batch) => batch.length <= CONTACT_ADDRESS_BATCH_SIZE)).toBe(true);
    expect(receivedBatches.flat()).toHaveLength(contactCount);
    expect(result[0].contact_addresses).toHaveLength(2);
    expect(result[1].contact_addresses).toEqual([]);
  });

  it("retourne tous les contacts lorsque contact_addresses est indisponible", async () => {
    const rows = contacts(702);
    const technicalError = new Error("contact_addresses indisponible");
    const logger = vi.fn();

    const result = await attachAddressesWithFallback(
      rows,
      async () => { throw technicalError; },
      logger,
    );

    expect(result).toEqual(rows);
    expect(result).toHaveLength(702);
    expect(logger).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(technicalError);
  });
});
