import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { deleteContactsSequentially, retainUnassignedContactSelection, toggleVisibleContactSelection } from "./bulk-delete";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("sélection temporaire des Contacts non attribués", () => {
  it("sélectionne un Contact individuellement", () => {
    expect([...toggleVisibleContactSelection(new Set(), ["contact-1"])]).toEqual(["contact-1"]);
  });

  it("sélectionne uniquement les Contacts visibles et conserve les sélections cachées", () => {
    const selected = toggleVisibleContactSelection(new Set(["hidden"]), ["visible-1", "visible-2"]);
    expect([...selected]).toEqual(["hidden", "visible-1", "visible-2"]);
    expect([...toggleVisibleContactSelection(selected, ["visible-1", "visible-2"])]).toEqual(["hidden"]);
  });

  it("retire de la sélection un Contact qui vient d’être attribué", () => {
    const selection = retainUnassignedContactSelection(new Set(["assigned", "unassigned"]), [
      { id: "assigned", broker: "france" },
      { id: "unassigned", broker: "unassigned" },
    ]);
    expect([...selection]).toEqual(["unassigned"]);
  });

  it("supprime séquentiellement et conserve précisément les échecs", async () => {
    const order: string[] = [];
    const deletedImmediately: string[] = [];
    const deleteContact = vi.fn(async (contactId: string) => {
      order.push(`start:${contactId}`);
      if (contactId === "blocked") throw new Error("Suppression refusée");
      order.push(`end:${contactId}`);
    });

    const result = await deleteContactsSequentially(
      ["first", "blocked", "last"],
      deleteContact,
      (contactId) => deletedImmediately.push(contactId),
    );

    expect(order).toEqual(["start:first", "end:first", "start:blocked", "start:last", "end:last"]);
    expect(result).toEqual({ deletedIds: ["first", "last"], failedIds: ["blocked"] });
    expect(deletedImmediately).toEqual(["first", "last"]);
  });

  it("réutilise deleteContact et impose confirmation, verrou et filtre Non attribués", () => {
    const page = source("app/contacts/page.tsx");
    const modal = source("app/components/contact-bulk-delete-modal.tsx");

    expect(page).toContain("deleteContact,");
    expect(page).toContain("deleteContactsSequentially(contactIds, async (contactId)");
    expect(page).toContain("await deleteContact(contactId)");
    expect(page).not.toContain('.from("contacts").delete()');
    expect(page).toContain('activeFilter === "unassigned" && <div className={`contacts-bulk-actions');
    expect(page).toContain('activeFilter === "unassigned" && <label className="contact-select-control"');
    expect(page).toContain("toggleVisibleContactSelection(current, pagedContactIds)");
    expect(page).toContain('if (activeFilter !== "unassigned") setSelectedContactIds(new Set())');
    expect(page).toContain('contact.broker === "unassigned" && selectedContactIds.has(contact.id)');
    expect(page).toContain("bulkDeleteLockRef.current || isBulkDeleting");
    expect(page).toContain("setSelectedContactIds(new Set(result.failedIds))");
    expect(page).toContain("<ContactBulkDeleteModal");
    expect(modal).toContain('role="alertdialog"');
    expect(modal).toContain("Cette action supprimera définitivement les Contacts sélectionnés.");
  });
});
