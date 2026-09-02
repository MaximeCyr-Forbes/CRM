import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const importer = readFileSync("app/components/oaciq-transaction-import.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

describe("saisie unique de l’acceptation manquante", () => {
  it("permet au dossier multipart de plus de 1 Mo d’atteindre la validation OACIQ existante", () => {
    expect(readFileSync("next.config.ts", "utf8")).toContain('serverActions: { bodySizeLimit: "4mb" }');
    expect(readFileSync("app/api/oaciq/analyze/route.ts", "utf8")).toContain('OACIQ_UPLOAD_LIMITS.bytes + 100_000');
  });
  it("présente un champ accessible seulement sans acceptation détectée et avec des délais concernés", () => {
    expect(importer).toContain('analysis && !detectedAcceptanceDate');
    expect(importer).toContain('proposals.some((p) => p.acceptanceRule)');
    expect(importer).toContain('{needsManualAcceptance &&');
    expect(importer).toContain('type="date" aria-label="Date d’acceptation" aria-describedby="oaciq-acceptance-help"');
    expect(importer).toContain('DATE D’ACCEPTATION REQUISE POUR CALCULER CETTE ÉCHÉANCE');
    expect(importer).toContain('qui peut différer de la date de la PA');
  });
  it("recalcule sans nouvel appel API, conserve la priorité de la détection et réinitialise la saisie avec les PDF", () => {
    const handler = importer.slice(importer.indexOf('function changeAcceptanceDate'), importer.indexOf('function setDocuments'));
    expect(handler).toContain('disabled || busy || detectedAcceptanceDate');
    expect(handler).toContain('recalculateDeadlinesFromAcceptanceDate(proposals, value, analysis?.acceptanceDateTime)');
    expect(handler).not.toMatch(/fetch|analyze\(|paDate/);
    expect(importer.match(/setManualAcceptanceDate\(""\)/g)).toHaveLength(2);
    expect(importer).toContain('detectedAcceptanceDate || (isAgendaDate(manualAcceptanceDate)');
    expect(importer).toContain('value={p.dueDate}');
  });
});

describe("zone de dépôt OACIQ harmonisée avec Centris", () => {
  it("cache l’input PDF multiple et laisse un vrai bouton accessible au clavier", () => {
    expect(importer).toMatch(/<input ref=\{inputRef\} className="sr-only" tabIndex=\{-1\} aria-label="Documents OACIQ PDF" type="file" multiple accept="application\/pdf,\.pdf"/);
    expect(importer).toMatch(/<button\s+type="button"\s+className=\{`transaction-centris-dropzone oaciq-dropzone/);
    expect(importer).toContain('aria-label="Choisir des PDF"');
    expect(importer).toContain("onClick={() => inputRef.current?.click()}");
    expect(importer).toContain("disabled={disabled || busy}");
  });

  it("réutilise les styles Centris sans redéfinir la bordure ni la typographie de la zone", () => {
    expect(importer).toContain('className="transaction-centris-file-button"');
    const localZone = styles.match(/\.oaciq-dropzone \{([^}]+)\}/)?.[1];
    expect(localZone).toBeTruthy();
    expect(localZone).not.toMatch(/border|padding|background|font-size/);
    expect(styles).toContain(".transaction-centris-dropzone:focus-visible");
    expect(styles).toContain(".transaction-centris-dropzone.is-dragging");
    expect(styles).toContain(".oaciq-dropzone > .oaciq-dropzone-content { display: grid; justify-items: center; gap: 0.45rem; color: inherit; }");
  });

  it("présente les textes et limites sans input natif visible", () => {
    for (const text of ["Déposez vos documents OACIQ ici", "Glissez-déposez vos PDF ou sélectionnez plusieurs fichiers", "CHOISIR DES PDF", "Maximum 20 PDF · 4 Mo au total"]) expect(importer).toContain(text);
    expect(importer).not.toContain("Aucun fichier choisi");
  });

  it("active et réinitialise le retour visuel du dépôt multiple", () => {
    expect(importer).toContain('isDragging && !disabled && !busy ? " is-dragging"');
    expect(importer).toContain("if (!disabled && !busy) setIsDragging(true)");
    expect(importer).toContain("onDragOver={(e) => e.preventDefault()}");
    expect(importer).toContain("e.currentTarget.contains(e.relatedTarget as Node | null)");
    expect(importer).toContain("e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files));");
  });

  it("conserve l’ajout multiple, le retrait individuel et l’analyse sous la liste", () => {
    expect(importer).toContain('addFiles(Array.from(e.target.files ?? [])); e.target.value = "";');
    expect(importer).toContain("setDocuments(files.filter((_, index) => index !== i))");
    expect(importer).toContain("validateOaciqFiles(next)");
    expect(importer).toContain('form.append("files", file)');
    expect(importer).toContain('fetch("/api/oaciq/analyze"');
    expect(importer.indexOf('className="oaciq-files"')).toBeLessThan(importer.indexOf("ANALYSER LES DOCUMENTS"));
    expect(importer).toContain("onAnalyzed(result.data)");
    expect(importer).toContain("proposalsFromAnalysis(result.data)");
  });
});
