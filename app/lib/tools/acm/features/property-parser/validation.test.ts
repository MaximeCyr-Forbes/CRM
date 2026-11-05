import { describe, expect, it } from "vitest";
import { hasPdfMagicBytes, sanitizeFileName, validatePdfMetadata } from "./validation";

const validFile = { name: "fiche Centris 123.pdf", type: "application/pdf", size: 100_000 };

describe("validation des fichiers PDF", () => {
  it("accepte un PDF conforme", () => {
    expect(validatePdfMetadata(validFile)).toEqual({ valid: true });
  });

  it("refuse une mauvaise extension", () => {
    expect(validatePdfMetadata({ ...validFile, name: "fiche.exe" }).code).toBe("INVALID_EXTENSION");
  });

  it("refuse un mauvais type MIME", () => {
    expect(validatePdfMetadata({ ...validFile, type: "text/html" }).code).toBe("INVALID_MIME");
  });

  it("refuse un fichier trop volumineux", () => {
    expect(validatePdfMetadata({ ...validFile, size: 5 * 1024 * 1024 }).code).toBe("FILE_TOO_LARGE");
  });

  it("détecte la signature PDF", () => {
    expect(hasPdfMagicBytes(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(hasPdfMagicBytes(new TextEncoder().encode("<html>"))).toBe(false);
  });

  it("neutralise les noms de fichier problématiques", () => {
    expect(sanitizeFileName("../fiche<script>.pdf")).toBe("fiche_script_.pdf");
  });
});
