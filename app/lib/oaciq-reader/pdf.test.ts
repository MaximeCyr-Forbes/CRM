import { describe, expect, it } from "vitest";
import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
} from "@cantoo/pdf-lib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { extractOaciqPdf } from "./pdf";
import { analyzeOaciqDocuments } from "./index";

async function syntheticPdf(scanned = false) {
  const doc = await PDFDocument.create(),
    page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  if (!scanned)
    page.drawText(
      "PROMESSE D'ACHAT PA 10001\n6.2 dans les 15 jours\n6.3 Financement\nREPONSE DU VENDEUR\nSigne le 2026-08-16 10:04:19",
      { x: 40, y: 720, size: 11, font, lineHeight: 20 },
    );
  return { doc, page, font };
}
describe("server PDF extraction", () => {
  it("reads a genuine generated PDF and calculates the same financing date", async () => {
    const { doc } = await syntheticPdf();
    const a = await analyzeOaciqDocuments([
      { name: "PA-10001.pdf", data: await doc.save() },
    ]);
    expect(a.deadlines.find((d) => d.type === "financing")).toMatchObject({
      dueDate: "2026-08-31",
      sourceSection: "6.2",
    });
  });
  it("reads visible signature appearance time ahead of certificate time", async () => {
    const { doc, page, font } = await syntheticPdf();
    const ap = doc.context.flateStream(
      "BT /TestFont 9 Tf 1 0 0 1 0 8 Tm (Signe le 2026-08-16 10:04:19) Tj ET",
      {
        Type: "XObject",
        Subtype: "Form",
        BBox: [0, 0, 260, 30],
        Resources: { Font: { TestFont: font.ref } },
      },
    );
    const signature = doc.context.obj({
      Type: "Sig",
      M: PDFString.of("D:20260817022040Z"),
      ContactInfo: PDFString.of("eZsign Personne Exemple IP: test"),
    });
    const widget = doc.context.obj({
      Type: "Annot",
      Subtype: "Widget",
      FT: "Sig",
      T: PDFString.of("respondent"),
      Rect: [330, 50, 590, 80],
      V: signature,
      AP: { N: doc.context.register(ap) },
    });
    const ref = doc.context.register(widget);
    page.node.addAnnot(ref);
    doc.catalog.set(PDFName.of("AcroForm"), doc.context.obj({ Fields: [ref] }));
    const a = await extractOaciqPdf({
      name: "CP-20002.pdf",
      data: await doc.save({ updateFieldAppearances: false }),
    });
    expect(a.signatures[0]).toMatchObject({
      signedAt: "2026-08-16T10:04:19-04:00",
      certificateSignedAt: "2026-08-16T22:20:40-04:00",
      pageIndex: 0,
    });
  });
  it("reads response selection from FreeText appearance", async () => {
    const { doc, page, font } = await syntheticPdf();
    const stream = doc.context.flateStream(
      "BT /TestFont 9 Tf 1 0 0 1 0 8 Tm (accepter) Tj ET",
      {
        Type: "XObject",
        Subtype: "Form",
        BBox: [0, 0, 100, 30],
        Resources: { Font: { TestFont: font.ref } },
      },
    );
    page.node.addAnnot(
      doc.context.register(
        doc.context.obj({
          Type: "Annot",
          Subtype: "FreeText",
          Rect: [330, 50, 430, 80],
          AP: { N: doc.context.register(stream) },
        }),
      ),
    );
    const a = await extractOaciqPdf({
      name: "CP-20002.pdf",
      data: await doc.save(),
    });
    expect(a.annotations[0].text).toBe("accepter");
  });
  it("reads signed/permission-encrypted PDFs openable with the empty user password", async () => {
    const { doc } = await syntheticPdf();
    doc.encrypt({
      userPassword: "",
      ownerPassword: "synthetic-fixture-only",
      algorithm: "AES-128",
    });
    const data = await doc.save();
    const before = new Uint8Array(data);
    const a = await analyzeOaciqDocuments([{ name: "PA-10001.pdf", data }]);
    expect(a.transactionDates.financing_deadline).toBe("2026-08-31");
    expect(data).toEqual(before);
  });
  it("fails explicitly on a scan instead of fabricating deadlines; accepts supplied OCR", async () => {
    const { doc } = await syntheticPdf(true),
      data = await doc.save();
    await expect(extractOaciqPdf({ name: "scan.pdf", data })).rejects.toThrow(
      "OCR",
    );
    const d = await extractOaciqPdf({
      name: "scan.pdf",
      data,
      ocrPages: ["PROMESSE D'ACHAT\n6.2 dans les 15 jours\n6.3"],
    });
    expect(d.ocrPages).toHaveLength(1);
  });
  it("rejects invalid bytes and mismatched OCR", async () => {
    await expect(
      extractOaciqPdf({ name: "bad.pdf", data: new Uint8Array([0, 1, 2]) }),
    ).rejects.toThrow("invalide");
    const { doc } = await syntheticPdf();
    await expect(
      extractOaciqPdf({
        name: "bad.pdf",
        data: await doc.save(),
        ocrPages: [],
      }),
    ).rejects.toThrow("correspondent");
  });
});

describe("private local original PDFs — never committed", () => {
  it.skipIf(
    !process.env.OACIQ_PRIVATE_PDF_DIR || !process.env.OACIQ_REFERENCE_PARSER,
  )(
    "source and CRM agree on real source regression PDFs",
    async () => {
      const root = process.env.OACIQ_PRIVATE_PDF_DIR!;
      const cases = [
        ["oasis.pdf"],
        ["pa_22619.pdf"],
        ["pa_23079.pdf", "annexe_r_45477.pdf"],
        ["pad_16157.pdf", "annexe_r_20060.pdf"],
      ].map((names, i) => ({
        name: String(i),
        paths: names.map((n) => join(root, n)),
      }));
      const reference = spawnSync(
        process.env.OACIQ_PYTHON || "python",
        [
          "-B",
          fileURLToPath(new URL("./reference-oracle.py", import.meta.url)),
          process.env.OACIQ_REFERENCE_PARSER!,
        ],
        {
          input: JSON.stringify(cases),
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
          timeout: 60000,
        },
      );
      expect(reference.status, reference.stderr).toBe(0);
      const expected = JSON.parse(reference.stdout);
      for (const c of cases) {
        const a = await analyzeOaciqDocuments(
          c.paths.map((p) => ({
            name: p.replaceAll("\\", "/").split("/").at(-1)!,
            data: new Uint8Array(readFileSync(p)),
          })),
        );
        const actual = {
          forms: a.forms,
          mainDocument: a.mainDocument,
          acceptanceDateTime: a.acceptanceDateTime,
          acceptanceSource: a.acceptanceSource,
          deadlines: a.deadlines.map(({ title, dateText, details }) => ({
            title,
            dateText,
            details,
          })),
          warnings: a.warnings,
          transactionDates: a.transactionDates,
          allDeadlinesDeferred: a.allDeadlinesDeferred,
        };
        // Explicit extraction-only improvement: PDF.js recovers the footer's
        // PA 26598 in oasis.pdf; pdfplumber split this number and returned "".
        // No other differences (especially deadline dates/warnings) are allowed.
        if (c.name === "0") {
          expect(expected[c.name].forms[0].number).toBe("");
          expect(actual.forms[0].number).toBe("26598");
          expected[c.name].forms[0].number = "26598";
        }
        expect
          .soft(actual, `private PDF scenario ${c.name}`)
          .toEqual(expected[c.name]);
      }
    },
    120000,
  );
});
