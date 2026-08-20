import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const modal = source("app/components/transaction-editor-modal.tsx");
const importer = source("app/components/centris-transaction-import.tsx");
const transactionsPage = source("app/transactions/page.tsx");
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
      "ERREUR DE LECTURE DU PDF",
      "PDF SANS TEXTE LISIBLE",
      "FICHE CENTRIS NON RECONNUE",
      "FICHE CENTRIS ANALYSÉE",
      "Informations Centris appliquées",
      "Analyser une autre fiche",
      "Retirer",
    ]) expect(importer).toContain(text);
    expect(importer).toContain('aria-live="polite"');
    expect(importer).toContain('role="alert"');
    expect(importer).toContain('payload.code === "no_text"');
    expect(importer).toContain('"invalid_pdf", "unsupported_pdf", "pdf_runtime_error", "parse_failed"');
  });

  it("garde la création manuelle et tous les champs du formulaire modifiables", () => {
    expect(modal).toContain('onSubmit={submit}');
    expect(modal).toContain('mode === "create" ? "Créer la transaction"');
    expect(importer).not.toContain("readOnly");
    expect(importer).not.toContain("onSave");
  });

  it("confirme un numéro Centris existant sans bloquer la création volontaire", () => {
    expect(modal).toContain("findTransactionsWithCentris(transactions, draft.centrisNumber)");
    expect(modal).toContain("TRANSACTION POSSIBLE DÉJÀ EXISTANTE");
    expect(modal).toContain("OUVRIR LA TRANSACTION EXISTANTE");
    expect(modal).toContain("CRÉER QUAND MÊME");
    expect(modal).toContain("createDespiteDuplicate");
    expect(transactionsPage).toContain("router.push(`/transactions/${transactionId}`)");
  });

  it("verrouille la soumission et conserve le vrai message retourné par l’API", () => {
    expect(modal).toContain("runSingleTransactionSave(saveLock");
    expect(modal).toContain("if (isBusy || saveLock.current) return;");
    expect(modal).toContain("disabled={isBusy}");
    expect(modal).toContain("aria-busy={isBusy}");
    expect(modal).toContain("caughtError instanceof Error");
    expect(modal).toContain("caughtError.message");
    expect(modal).toContain("CRÉATION…");
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
