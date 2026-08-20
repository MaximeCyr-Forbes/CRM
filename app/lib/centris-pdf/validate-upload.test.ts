import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_CENTRIS_PDF_SIZE_BYTES, validateCentrisPDFUpload } from "./validate-upload";

describe("sécurité de l’import PDF Centris", () => {
  it("accepte uniquement un PDF non vide de 20 Mo ou moins", () => {
    expect(validateCentrisPDFUpload({ name: "fiche.pdf", type: "application/pdf", size: 1000 })).toEqual({ valid: true });
    expect(validateCentrisPDFUpload({ name: "fiche.txt", type: "text/plain", size: 1000 })).toMatchObject({ valid: false, status: 415 });
    expect(validateCentrisPDFUpload({ name: "fiche.pdf", type: "application/pdf", size: MAX_CENTRIS_PDF_SIZE_BYTES + 1 })).toMatchObject({ valid: false, status: 413 });
    expect(validateCentrisPDFUpload({ name: "fiche.pdf", type: "application/pdf", size: 0 })).toMatchObject({ valid: false, status: 400 });
  });

  it("protège la route, vérifie l’origine et ne persiste pas le fichier", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/centris/parse/route.ts"), "utf8");
    expect(route).toContain("requireApiAccess()");
    expect(route).toContain("isSameOriginRequest(request)");
    expect(route).toContain('formData.get("file")');
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).not.toContain("supabase");
    expect(route).not.toContain("writeFile");
    expect(route).not.toContain("TransactionEditorModal");
  });

  it("journalise seulement des métadonnées techniques sûres", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/centris/parse/route.ts"), "utf8");
    expect(route).toContain("category:");
    expect(route).toContain("fileName: safeName");
    expect(route).toContain("size,");
    expect(route).toContain("pageCount:");
    expect(route).toContain("stage:");
    expect(route).toContain("runtimeErrorName:");
    expect(route).toContain('code: failure?.category ?? "parse_failed"');
    expect(route).not.toContain("extracted.pages");
    expect(route).not.toContain("console.log");
  });
});
