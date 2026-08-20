import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const modal = source("app/components/transaction-editor-modal.tsx");
const importer = source("app/components/centris-transaction-import.tsx");
const styles = source("app/globals.css");

describe("interface d’import Centris dans une nouvelle Transaction", () => {
  it("affiche l’import uniquement en création avant le champ Adresse", () => {
    expect(modal).toContain('mode === "create" && <CentrisTransactionImport');
    expect(modal.indexOf("<CentrisTransactionImport")).toBeLessThan(modal.indexOf("Adresse *"));
    expect(modal).not.toContain('mode === "edit" && <CentrisTransactionImport');
  });

  it("supporte sélection, glisser-déposer et analyse par l’API existante", () => {
    expect(importer).toContain('accept="application/pdf,.pdf"');
    expect(importer).toContain("onDragEnter");
    expect(importer).toContain("onDragOver");
    expect(importer).toContain("onDragLeave");
    expect(importer).toContain("onDrop={handleDrop}");
    expect(importer).toContain('formData.append("file", file)');
    expect(importer).toContain('fetch("/api/centris/parse"');
    expect(importer).not.toContain("supabase");
  });

  it("présente les états analyse, erreur, succès, retrait et changement de fiche", () => {
    for (const text of [
      "ANALYSE DE LA FICHE CENTRIS…",
      "FICHE NON RECONNUE",
      "FICHE CENTRIS ANALYSÉE",
      "Informations Centris appliquées",
      "Analyser une autre fiche",
      "Retirer",
    ]) expect(importer).toContain(text);
    expect(importer).toContain('aria-live="polite"');
    expect(importer).toContain('role="alert"');
  });

  it("garde la création manuelle et tous les champs du formulaire modifiables", () => {
    expect(modal).toContain('onSubmit={submit}');
    expect(modal).toContain('mode === "create" ? "Créer la transaction"');
    expect(importer).not.toContain("readOnly");
    expect(importer).not.toContain("onSave");
  });

  it("affiche les conflits, la confiance et le contexte des locations", () => {
    expect(importer).toContain("item.hasConflict");
    expect(importer).toContain("Actuelle :");
    expect(importer).toContain("Centris :");
    expect(importer).toContain("À vérifier");
    expect(modal).toContain("Valeur provenant d’une fiche de LOCATION");
    expect(importer).toContain("PRIX À CONFIRMER MANUELLEMENT");
  });

  it("utilise les classes dédiées et une mise en page mobile à une colonne", () => {
    for (const className of [
      "transaction-centris-import",
      "transaction-centris-dropzone",
      "transaction-centris-preview",
      "transaction-centris-summary",
      "transaction-centris-warning",
      "transaction-centris-details",
      "transaction-centris-field-choice",
    ]) expect(styles).toContain(`.${className}`);
    expect(styles).toContain(".transaction-centris-summary,");
    expect(styles).toContain("grid-template-columns: 1fr;");
  });
});
