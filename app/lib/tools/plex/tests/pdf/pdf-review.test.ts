import { describe, expect, it } from "vitest";
import { buildPdfReviewRows } from "@/app/lib/tools/plex/components/manual/pdf-review";
import { parseCentrisPages } from "@/app/lib/tools/plex/infrastructure/pdf";

const emptyExpenses = {
  municipalTaxes: 0,
  schoolTaxes: 0,
  insurance: 0,
  lawn: 0,
  snowRemoval: 0,
  maintenance: 0,
  repairs: 0,
  electricity: 0,
  heating: 0,
  management: 0,
  other: 0,
};

const extraction = parseCentrisPages(
  [{ page: 1, text: "Adresse : 10, rue Exemple\nPrix demandé : 500 000 $" }],
  "fiche-test.pdf",
);

describe("affichage des dépenses saisies manuellement dans le bilan PDF", () => {
  it("remplace l'affichage manquant du gazon sans modifier l'extraction", () => {
    const expenses = { ...emptyExpenses, lawn: 2000 };
    const originalLawn = extraction.expenses.find((field) => field.key === "lawn")!;

    const rows = buildPdfReviewRows(
      extraction,
      expenses,
      new Set(["expense.lawn"]),
    );
    const lawnRows = rows.filter((row) => row.field.key === "lawn");

    expect(lawnRows).toHaveLength(1);
    expect(lawnRows[0].manualValue).toBe(2000);
    expect(lawnRows[0].field).toBe(originalLawn);
    expect(originalLawn).toMatchObject({ value: null, status: "missing" });
    expect(expenses).toEqual({ ...emptyExpenses, lawn: 2000 });
  });

  it("conserve Information manquante lorsqu'il n'y a aucune saisie manuelle", () => {
    const lawnRow = buildPdfReviewRows(
      extraction,
      emptyExpenses,
      new Set(),
    ).find((row) => row.field.key === "lawn");

    expect(lawnRow?.field.value).toBeNull();
    expect(lawnRow?.manualValue).toBeUndefined();
  });

  it("reconnaît 0 comme une valeur saisie manuellement", () => {
    const lawnRow = buildPdfReviewRows(
      extraction,
      emptyExpenses,
      new Set(["expense.lawn"]),
    ).find((row) => row.field.key === "lawn");

    expect(lawnRow?.manualValue).toBe(0);
  });

  it("ajoute Autres dépenses une seule fois dans la zone des dépenses", () => {
    const rows = buildPdfReviewRows(
      extraction,
      { ...emptyExpenses, other: 350 },
      new Set(["expense.other"]),
    );
    const otherRows = rows.filter((row) => row.field.key === "other");

    expect(otherRows).toHaveLength(1);
    expect(otherRows[0].manualValue).toBe(350);
  });

  it("retire l'adresse et les détails des logements tout en gardant leur nombre", () => {
    const extractionWithUnit = parseCentrisPages([
      {
        page: 1,
        text: "Adresse : 10, rue Exemple\nNombre de logements : 1\nLogement 4 : 4 ½ | Loyer actuel : 1 250 $ | Loyer potentiel : 1 400 $",
      },
    ]);
    const rows = buildPdfReviewRows(
      extractionWithUnit,
      emptyExpenses,
      new Set(),
    );
    const keys = rows.map((row) => row.field.key);

    expect(keys).not.toContain("address");
    expect(keys.some((key) => /^unit-.+-(?:description|current-rent|potential-rent)$/.test(key))).toBe(false);
    expect(keys).toContain("unit-count");
  });

  it("affiche une seule fois les revenus bruts effectifs et le revenu net déclarés", () => {
    const summaryExtraction = parseCentrisPages([
      {
        page: 3,
        text: "Revenus bruts effectifs 110 000 $\nRevenus nets d’exploitation 75 000 $",
      },
    ]);
    const rows = buildPdfReviewRows(summaryExtraction, emptyExpenses, new Set());

    expect(rows.filter((row) => row.field.key === "reported-effective-gross-annual-revenue")).toHaveLength(1);
    expect(rows.filter((row) => row.field.key === "reported-net-operating-income")).toHaveLength(1);
    expect(rows.find((row) => row.field.key === "reported-net-operating-income")?.field).toMatchObject({
      value: 75000,
      page: 3,
      status: "confirmed",
    });
  });
});
