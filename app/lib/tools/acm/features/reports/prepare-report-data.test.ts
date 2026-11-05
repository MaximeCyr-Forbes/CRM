import { describe, expect, it } from "vitest";
import type { ComparableAdjustment } from "../../types";
import { assignPropertyPosition, createComparisonSelection, prepareCmaReportData } from "../comparables";
import { prepareReportDocumentData } from "./prepare-report-data";
import { createReportFixture } from "./report-test-fixtures";

describe("préparation des données du rapport", () => {
  it("prépare une propriété unifamiliale et son opinion de valeur", () => {
    const prepared = prepareReportDocumentData(createReportFixture(), new Date("2026-08-29T12:00:00Z"));
    expect(prepared.subject.fields.map(({ label }) => label)).toEqual(expect.arrayContaining(["Chambres", "Salles de bains", "Garage"]));
    expect(prepared.opinion.recommendedValue).toBe(639_000);
    expect(prepared.preparedDate).toContain("2026");
  });

  it("adapte les champs à une propriété à revenus", () => {
    const prepared = prepareReportDocumentData(createReportFixture({ category: "income_property" }));
    expect(prepared.subject.fields.map(({ label }) => label)).toEqual(expect.arrayContaining(["Nombre d’unités", "Revenus bruts potentiels", "Revenu net d’exploitation", "MRB"]));
    expect(prepared.comparisonRows.map(({ id }) => id)).toContain("grossRevenue");
  });

  it("omet proprement les champs optionnels absents", () => {
    const report = createReportFixture();
    report.subject.data.garage = undefined;
    report.subject.data.parking = undefined;
    const prepared = prepareReportDocumentData(report);
    expect(prepared.subject.fields.map(({ label }) => label)).not.toContain("Garage");
    expect(prepared.subject.fields.map(({ label }) => label)).not.toContain("Stationnement");
  });

  it("utilise le prix demandé pour un comparable sans prix vendu", () => {
    const prepared = prepareReportDocumentData(createReportFixture({ comparableCount: 2 }));
    expect(prepared.comparables[1].analysis.referencePriceSource).toBe("asking_price");
    expect(prepared.comparables[1].analysis.referencePrice).toBe(630_000);
  });

  it("conserve les ajustements positifs et négatifs séparément", () => {
    const adjustments: ComparableAdjustment[] = [
      { id: "positive", category: "land", description: "Inférieur", amount: 15_000 },
      { id: "negative", category: "condition", description: "Supérieur", amount: -5_000 },
    ];
    const prepared = prepareReportDocumentData(createReportFixture({ adjustments }));
    expect(prepared.comparables[0].analysis.adjustments.map(({ amount }) => amount)).toEqual([15_000, -5_000]);
    expect(prepared.comparables[0].analysis.adjustedPrice).toBe(610_000);
  });

  it("fonctionne sans photo ni commentaire", () => {
    const prepared = prepareReportDocumentData(createReportFixture({ withoutPhotos: true, withoutComment: true }));
    expect(prepared.subject.primaryPhoto).toBeUndefined();
    expect(prepared.opinion.brokerComment).toBe("");
  });

  it("utilise le sujet et l’ordre des comparables réattribués dans la brochure", () => {
    const fixture = createReportFixture({ comparableCount: 3 });
    const properties = [fixture.subject, ...fixture.comparables.map(({ property }) => property)];
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    let selection = createComparisonSelection(properties.map(({ id }) => id));
    selection = assignPropertyPosition(selection, "comparable-2", 0);
    selection = assignPropertyPosition(selection, "comparable-3", 1);
    const subject = propertyById.get(selection.subjectId)!;
    const comparables = selection.comparableIds.map((id) => propertyById.get(id)!);

    const prepared = prepareReportDocumentData(prepareCmaReportData(subject, comparables, {}, fixture.opinion));

    expect(prepared.subject.property.id).toBe("comparable-2");
    expect(prepared.comparables.map(({ property }) => property.id)).toEqual(["comparable-3", "subject", "comparable-1"]);
    expect(prepared.comparisonRows[0].values).toHaveLength(4);
  });

  it("formate les années sans séparateur de milliers dans chaque zone du rapport", () => {
    const fixture = createReportFixture({ comparableCount: 3 });
    fixture.subject.data.yearBuilt = 1988;
    [1991, 1930, 1987].forEach((year, index) => {
      fixture.comparables[index].property.data.yearBuilt = year;
    });

    const prepared = prepareReportDocumentData(fixture);
    expect(prepared.subject.fields.find(({ label }) => label === "Année de construction")?.value).toBe("1988");
    expect(prepared.comparables.map(({ fields }) => fields.find(({ label }) => label === "Année de construction")?.value)).toEqual(["1991", "1930", "1987"]);
    expect(prepared.comparisonRows.find(({ id }) => id === "yearBuilt")?.values).toEqual(["1988", "1991", "1930", "1987"]);
  });
});
