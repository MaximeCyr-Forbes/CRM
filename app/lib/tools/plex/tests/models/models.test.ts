import { describe, expectTypeOf, it } from "vitest";
import type {
  AcquisitionCost,
  AnalysisCriteria,
  AnnualProjection,
  Income,
  IncomeScenario,
  MajorWork,
  MortgageFinancing,
  OperatingExpense,
  Property,
  Unit,
} from "@/app/lib/tools/plex/domain/models";

describe("modèles du domaine", () => {
  it("expose chaque modèle comme un contrat indépendant", () => {
    expectTypeOf<Property>().toBeObject();
    expectTypeOf<Unit>().toBeObject();
    expectTypeOf<Income>().toBeObject();
    expectTypeOf<OperatingExpense>().toBeObject();
    expectTypeOf<MajorWork>().toBeObject();
    expectTypeOf<AcquisitionCost>().toBeObject();
    expectTypeOf<MortgageFinancing>().toBeObject();
    expectTypeOf<IncomeScenario>().toBeObject();
    expectTypeOf<AnnualProjection>().toBeObject();
    expectTypeOf<AnalysisCriteria>().toBeObject();
  });
});
