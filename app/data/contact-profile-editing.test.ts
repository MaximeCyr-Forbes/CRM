import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("édition rapide de la fiche contact", () => {
  it("expose les trois crayons accessibles sans retirer les actions existantes", () => {
    const profile = source("app/contacts/[contactId]/page.tsx");

    expect(profile).toContain('aria-label="Modifier les coordonnées"');
    expect(profile).toContain('setContactEditorMode("coordinates")');
    expect(profile).toContain('aria-label="Modifier la responsabilité"');
    expect(profile).toContain('setContactEditorMode("responsibility")');
    expect(profile).toContain('aria-label="Modifier le suivi"');
    expect(profile).toContain("onClick={requestFollowUp}");
    expect(profile).toContain("Relancer");
    expect(profile).toContain("Ajouter une note");
    expect(profile).toContain("Action");
    expect(profile).toContain("Changer le courtier");
    expect(profile).toContain("GÉRER LES ADRESSES");
    expect(profile).toContain("TRANSACTIONS LIÉES");
  });

  it("préremplit les modes ciblés avec les champs demandés et le modèle complet du contact", () => {
    const editor = source("app/components/contact-editor-modal.tsx");

    expect(editor).toContain('mode === "coordinates"');
    expect(editor).toContain("MODIFIER LES COORDONNÉES");
    expect(editor).toContain("MODIFIER LA RESPONSABILITÉ");
    for (const field of ["phone", "email", "birthDate", "mortgageRenewalDate", "civicNumber", "address", "apartment", "city", "province", "postalCode", "country", "broker", "clientType", "clientProvenance", "priority", "status"]) {
      expect(editor).toContain(`value={values.${field}`);
    }
  });

  it("continue d’utiliser updateContact pour les adresses, anniversaires et changements de courtier", () => {
    const dataContext = source("app/crm-data-context.tsx");

    expect(dataContext).toContain("fallbackAddresses(currentContact)");
    expect(dataContext).toContain("mergeAddressCollections([editedPrimary], previousAddresses)");
    expect(dataContext).toContain("setPrimaryAddress(");
    expect(dataContext).toContain("if (brokerChanged && (updated.nextFollowUpDate || updated.googleCalendarEventId))");
    expect(dataContext).toContain("if (currentContact.birthDate !== updated.birthDate) await requestBirthdaySync([contactId])");
    expect(dataContext).toContain("currentContact.mortgageRenewalDate !== updated.mortgageRenewalDate");
  });
});

describe("gestion complète de l’historique", () => {
  it("offre l’ajout, la modification et la suppression avec une confirmation dédiée", () => {
    const history = source("app/components/client-history.tsx");
    const profile = source("app/contacts/[contactId]/page.tsx");
    const confirmation = source("app/components/note-delete-confirmation-modal.tsx");

    expect(history).toContain("+ Ajouter une note");
    expect(history).toContain("onEdit(note)");
    expect(history).toContain("onDelete(note)");
    expect(profile).toContain("onAdd={requestNewNote}");
    expect(profile).toContain("onDelete={setNoteToDelete}");
    expect(confirmation).toContain("SUPPRIMER CETTE NOTE ?");
    expect(confirmation).toContain("SUPPRIMER LA NOTE");
    expect(confirmation).not.toContain("window.confirm");
  });

  it("met à jour uniquement le contenu lors d’une modification et retire la note ciblée du state", () => {
    const dataContext = source("app/crm-data-context.tsx");

    expect(dataContext).toContain("note.id === noteId ? { ...note, content: content.trim() } : note");
    expect(dataContext).toContain("current.filter((note) => note.id !== result.noteId)");
    expect(dataContext).toContain("lastContactDate: result.lastContactDate");
  });
});
