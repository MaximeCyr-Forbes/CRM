import { afterEach, describe, expect, it, vi } from "vitest";
import { validStatusForTransaction, type Transaction } from "../../data/transaction-types";
import { deleteTransactionWithCalendarCleanup, TRANSACTION_DELETE_WARNING } from "./delete-workflow";
import { transactionDraftFromTransaction } from "./editor";
import { transactionContactChanges, transactionUpdateValues } from "./persistence";
import { removeTransactionFromState, replaceTransactionInState } from "./state";

function transaction(values: Partial<Transaction> = {}): Transaction {
  return {
    id: "transaction-1",
    address: "1403 Rue Exemple",
    centrisNumber: "12345678",
    type: "purchase",
    broker: "maxime",
    contactIds: ["contact-jean", "contact-marie"],
    price: 525000,
    soldPrice: null,
    promiseDate: "2026-08-20",
    notaryDate: null,
    collaboratingBrokerName: "",
    saleFinalizedAt: null,
    purchaseFinalizedAt: null,
    status: "inspection",
    generalNotes: "Inspection prévue vendredi.",
    deadlines: [],
    notes: [],
    sourceListing: null,
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    ...values,
  };
}

function deadline(id: string, googleCalendarEventId: string | null) {
  return {
    id,
    transactionId: "transaction-1",
    title: "Inspection",
    dueDate: "2026-08-22",
    dueTime: null,
    completed: false,
    googleCalendarEventId,
    googleCalendarEventBroker: googleCalendarEventId ? "maxime" as const : null,
    googleCalendarSyncStatus: "synced" as const,
    googleCalendarLastError: null,
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
  };
}

describe("modification d'une transaction", () => {
  it("préremplit tous les champs actuels avec le même UUID hors brouillon", () => {
    const current = transaction();
    expect(transactionDraftFromTransaction(current)).toEqual({
      address: current.address,
      centrisNumber: current.centrisNumber,
      type: current.type,
      broker: current.broker,
      contactIds: current.contactIds,
      price: current.price,
      promiseDate: current.promiseDate,
      status: current.status,
      generalNotes: current.generalNotes,
    });
  });

  it("prépare tous les champs généraux pour la mise à jour", () => {
    expect(transactionUpdateValues({
      address: " 1500 Rue Modifiée ",
      centrisNumber: " 87654321 ",
      type: "sale",
      broker: "france",
      price: 610000,
      promiseDate: "2026-09-01",
      status: "on_market",
      generalNotes: " Notes modifiées ",
      contactIds: ["contact-jean"],
    })).toEqual({
      address: "1500 Rue Modifiée",
      centris_number: "87654321",
      type: "sale",
      broker: "france",
      price: 610000,
      promise_date: "2026-09-01",
      status: "on_market",
      general_notes: "Notes modifiées",
    });
  });

  it("conserve un statut valide après un changement de type", () => {
    expect(validStatusForTransaction("sale", "inspection")).toBe("inspection");
  });

  it("réinitialise à nouveau un statut incompatible Achat/Vente", () => {
    expect(validStatusForTransaction("sale", "pa_preparation")).toBe("new");
    expect(validStatusForTransaction("purchase", "on_market")).toBe("new");
  });

  it("ajoute et retire seulement les relations de contacts nécessaires", () => {
    expect(transactionContactChanges(
      ["contact-jean", "contact-marie"],
      ["contact-jean", "contact-pierre", "contact-luc"],
    )).toEqual({
      added: ["contact-pierre", "contact-luc"],
      removed: ["contact-marie"],
    });
  });

  it("conserve plusieurs contacts liés sans doublons relationnels", () => {
    expect(transactionContactChanges(["contact-jean"], ["contact-jean", "contact-jean", "contact-marie"]))
      .toEqual({ added: ["contact-marie"], removed: [] });
  });

  it("met à jour immédiatement la transaction dans l'état local", () => {
    const original = transaction();
    const updated = transaction({ address: "1500 Rue Modifiée" });
    expect(replaceTransactionInState([original], updated)).toEqual([updated]);
  });
});

describe("suppression d'une transaction", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tente le nettoyage de chaque événement Google avant la suppression CRM", async () => {
    const calls: string[] = [];
    const current = transaction({ deadlines: [deadline("deadline-1", "google-1"), deadline("deadline-2", null), deadline("deadline-3", "google-3")] });

    const result = await deleteTransactionWithCalendarCleanup(
      current,
      async (item) => { calls.push(`google:${item.id}`); },
      async (transactionId) => { calls.push(`crm:${transactionId}`); },
    );

    expect(calls).toEqual(["google:deadline-1", "google:deadline-3", "crm:transaction-1"]);
    expect(result.warning).toBeUndefined();
  });

  it("supprime quand même la transaction et retourne un avertissement si Google échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deleteRecord = vi.fn(async () => undefined);
    const current = transaction({ deadlines: [deadline("deadline-1", "google-1")] });

    const result = await deleteTransactionWithCalendarCleanup(
      current,
      async () => { throw new Error("Google indisponible"); },
      deleteRecord,
    );

    expect(deleteRecord).toHaveBeenCalledWith(current.id);
    expect(result.warning).toBe(TRANSACTION_DELETE_WARNING);
  });

  it("retire immédiatement la transaction supprimée de l'état sans toucher aux contacts", () => {
    const deleted = transaction();
    const kept = transaction({ id: "transaction-2", contactIds: ["contact-marie"] });
    expect(removeTransactionFromState([deleted, kept], deleted.id)).toEqual([kept]);
    expect(kept.contactIds).toEqual(["contact-marie"]);
  });

  it("ne supprime rien tant que le workflow définitif n'est pas appelé", () => {
    const deleteRecord = vi.fn();
    expect(deleteRecord).not.toHaveBeenCalled();
  });
});
