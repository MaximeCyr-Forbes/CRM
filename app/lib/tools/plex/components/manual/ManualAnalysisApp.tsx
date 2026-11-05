"use client";


import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
} from "react";
import {
  calculateBadDebtLoss,
  calculateExpenseRatio,
  calculateAnnualGrossRevenue,
  calculateCapitalizationRate,
  calculateDebtServiceCoverageRatio,
  calculateDownPaymentReturn,
  calculateEffectiveGrossRevenue,
  calculateGrossRentMultiplier,
  calculateInitialInvestment,
  calculateInitialInvestmentReturn,
  calculateManagementExpense,
  calculateNetIncomeMultiplier,
  calculateNetOperatingIncome,
  calculateOperatingExpenses,
  calculateVacancyLoss,
} from "@/app/lib/tools/plex/domain/calculations/financial";
import { evaluateCashFlowOutlook } from "@/app/lib/tools/plex/domain/analysis";
import {
  calculateTenYearMortgageRenewalProjection,
  type RenewalProjectionScheduleEntry,
} from "@/app/lib/tools/plex/domain/calculations/mortgage";
import {
  calculateTenYearFinancialProjection,
  type AnnualFinancialProjection,
  type ProjectionMortgageEntry,
} from "@/app/lib/tools/plex/domain/calculations/projection";
import {
  getCurrentMonthlyRevenues,
  getMonthlyRentForScenario,
  getPotentialMonthlyRentsWithCurrentFallback,
  REVENUE_SCENARIO_LABELS,
  type RevenueScenario,
} from "@/app/lib/tools/plex/domain/scenarios/revenue-scenarios";
import { formatCad } from "@/app/lib/tools/plex/lib/formatters/currency";
import { parseLocalizedMoney } from "@/app/lib/tools/plex/lib/parsers/localized-money";
import {
  applyCentrisExtraction,
  extractCentrisPdf,
  type CentrisExtraction,
  type ExtractedField,
} from "@/app/lib/tools/plex/infrastructure/pdf";
import {
  buildPdfReviewRows,
  type PdfReviewRow,
} from "@/app/lib/tools/plex/components/manual/pdf-review";

const EXPENSE_FIELDS = [
  ["municipalTaxes", "Taxes municipales"],
  ["schoolTaxes", "Taxes scolaires"],
  ["insurance", "Assurance"],
  ["lawn", "Gazon"],
  ["snowRemoval", "Déneigement"],
  ["maintenance", "Entretien"],
  ["repairs", "Réparations"],
  ["electricity", "Électricité"],
  ["heating", "Chauffage"],
  ["management", "Gestion (% des revenus bruts)"],
  ["other", "Autres dépenses"],
] as const;

const MAX_MONTHLY_AMORTIZATION_ROWS = 300;

type ExpenseKey = (typeof EXPENSE_FIELDS)[number][0];

const FIXED_EXPENSE_KEYS = EXPENSE_FIELDS
  .filter(([key]) => key !== "management")
  .map(([key]) => key);

interface RevenueRow {
  id: string;
  description: string;
  currentMonthlyRent: number;
  potentialMonthlyRent: number;
  customMonthlyRent: number;
  status: "" | "occupied" | "vacant";
  otherMonthlyIncome: number;
}

interface MajorWorkRow {
  id: string;
  description: string;
  projectedYear: number;
  amount: number;
}

interface ManualAnalysisData {
  activeRevenueScenario: RevenueScenario;
  property: {
    address: string;
    propertyType: string;
    unitCount: number;
    askingPrice: number;
    analyzedPrice: number;
  };
  revenues: RevenueRow[];
  expenses: Record<ExpenseKey, number>;
  majorWorks: MajorWorkRow[];
  acquisition: {
    downPayment: number;
    welcomeTax: number;
    notary: number;
    inspection: number;
    immediateWorks: number;
    other: number;
  };
  financing: {
    initialRate: number;
    renewalRate: number;
    amortizationYears: number;
    firstTermYears: number;
    startDate: string;
  };
  projection: {
    annualRentIncrease: number;
    annualExpenseIncrease: number;
    vacancyRate: number;
    badDebtRate: number;
    annualAppreciation: number;
    appreciationEnabled: boolean;
  };
}

const EMPTY_DATA: ManualAnalysisData = {
  activeRevenueScenario: "current",
  property: {
    address: "",
    propertyType: "",
    unitCount: 0,
    askingPrice: 0,
    analyzedPrice: 0,
  },
  revenues: [
    {
      id: "unit-1",
      description: "",
      currentMonthlyRent: 0,
      potentialMonthlyRent: 0,
      customMonthlyRent: 0,
      status: "",
      otherMonthlyIncome: 0,
    },
  ],
  expenses: {
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
  },
  majorWorks: [
    { id: "work-1", description: "", projectedYear: 0, amount: 0 },
  ],
  acquisition: {
    downPayment: 0,
    welcomeTax: 0,
    notary: 0,
    inspection: 0,
    immediateWorks: 0,
    other: 0,
  },
  financing: {
    initialRate: 5,
    renewalRate: 6,
    amortizationYears: 25,
    firstTermYears: 5,
    startDate: "",
  },
  projection: {
    annualRentIncrease: 3,
    annualExpenseIncrease: 2,
    vacancyRate: 2,
    badDebtRate: 1,
    annualAppreciation: 3,
    appreciationEnabled: true,
  },
};

function applyStartingFinancingDefaults(
  analysis: ManualAnalysisData,
  manualEdits: ReadonlySet<string> = new Set(),
): ManualAnalysisData {
  const next = structuredClone(analysis);
  if (!manualEdits.has("acquisition.downPayment")) {
    next.acquisition.downPayment = 0;
  }
  if (!manualEdits.has("financing.initialRate")) {
    next.financing.initialRate = 5;
  }
  if (!manualEdits.has("financing.renewalRate")) {
    next.financing.renewalRate = 6;
  }
  if (!manualEdits.has("financing.amortizationYears")) {
    next.financing.amortizationYears = 25;
  }
  if (!manualEdits.has("financing.firstTermYears")) {
    next.financing.firstTermYears = 5;
  }
  if (!manualEdits.has("financing.startDate")) {
    next.financing.startDate = new Date().toISOString().slice(0, 10);
  }
  return next;
}

function createEmptyAnalysis(): ManualAnalysisData {
  return applyStartingFinancingDefaults(EMPTY_DATA);
}

function toCents(value: number): number {
  return value * 100;
}

function fromInput(value: string): number {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(valueInCents: number | null): string {
  if (valueInCents === null) return "—";
  return formatCad({ amountInCents: valueInCents, currency: "CAD" });
}

function compactMoney(valueInCents: number | null): string {
  if (valueInCents === null) return "—";
  return (valueInCents / 100).toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });
}

function ratio(value: number | null, suffix: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("fr-CA", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}${suffix}`;
}

function safely<T>(calculation: () => T): T | null {
  try {
    return calculation();
  } catch {
    return null;
  }
}

function calculateFirstYearOperatingResults(
  grossRevenue: number | null,
  operatingExpenses: number | null,
  vacancyRate: number,
  badDebtRate: number,
) {
  if (grossRevenue === null || operatingExpenses === null) {
    return {
      effectiveRevenue: null,
      netOperatingIncome: null,
    };
  }

  const vacancyLoss = safely(() =>
    calculateVacancyLoss(grossRevenue, vacancyRate),
  );
  const badDebtLoss = safely(() =>
    calculateBadDebtLoss(grossRevenue, badDebtRate),
  );
  if (vacancyLoss === null || badDebtLoss === null) {
    return {
      effectiveRevenue: null,
      netOperatingIncome: null,
    };
  }

  const effectiveRevenue = safely(() =>
    calculateEffectiveGrossRevenue(grossRevenue, vacancyLoss, badDebtLoss),
  );
  const netOperatingIncome =
    effectiveRevenue === null
      ? null
      : safely(() =>
          calculateNetOperatingIncome(effectiveRevenue, operatingExpenses),
        );

  return { effectiveRevenue, netOperatingIncome };
}

function projectionMajorWorks(data: ManualAnalysisData) {
  return data.majorWorks
    .filter((work) => work.amount !== 0)
    .map((work) => ({
      year: work.projectedYear,
      amountInCents: toCents(work.amount),
    }));
}

function projectionMortgageSchedule(
  data: ManualAnalysisData,
  schedule: readonly RenewalProjectionScheduleEntry[] | undefined,
): readonly ProjectionMortgageEntry[] | null {
  const analyzedPriceInCents = toCents(data.property.analyzedPrice);
  const downPaymentInCents = toCents(data.acquisition.downPayment);

  if (
    analyzedPriceInCents > 0 &&
    downPaymentInCents === analyzedPriceInCents
  ) {
    return Array.from({ length: 120 }, () => ({
      paymentInCents: 0,
      principalInCents: 0,
      interestInCents: 0,
      closingBalanceInCents: 0,
    }));
  }

  return schedule ?? null;
}

function calculateProjectionFromFinancialInputs(
  data: ManualAnalysisData,
  grossRevenue: number | null,
  fixedOperatingExpenses: number | null,
  mortgageSchedule: readonly ProjectionMortgageEntry[] | null,
): readonly AnnualFinancialProjection[] {
  if (
    grossRevenue === null ||
    fixedOperatingExpenses === null ||
    mortgageSchedule === null
  ) {
    return [];
  }

  return safely(() =>
    calculateTenYearFinancialProjection({
      baseAnnualGrossRevenueInCents: grossRevenue,
      baseAnnualOperatingExpensesInCents: fixedOperatingExpenses,
      managementRatePercent: data.expenses.management,
      annualRentIncreasePercent: data.projection.annualRentIncrease,
      annualExpenseIncreasePercent: data.projection.annualExpenseIncrease,
      vacancyRatePercent: data.projection.vacancyRate,
      badDebtRatePercent: data.projection.badDebtRate,
      analyzedPropertyValueInCents: toCents(data.property.analyzedPrice),
      annualAppreciationPercent: data.projection.annualAppreciation,
      appreciationEnabled: data.projection.appreciationEnabled,
      yearOneAcquisitionCostsInCents: calculateInitialInvestment(
        0,
        [
          data.acquisition.welcomeTax,
          data.acquisition.notary,
          data.acquisition.inspection,
          data.acquisition.other,
        ].map(toCents),
        [toCents(data.acquisition.immediateWorks)],
        0,
      ),
      mortgageSchedule,
      majorWorks: projectionMajorWorks(data),
    }),
  ) ?? [];
}

function calculateCurrentOnlyTenYearProjection(
  data: ManualAnalysisData,
): readonly AnnualFinancialProjection[] {
  const grossRevenue = safely(() =>
    calculateAnnualGrossRevenue(getCurrentMonthlyRevenues(data.revenues).map(toCents)),
  );
  const fixedOperatingExpenses = safely(() =>
    calculateOperatingExpenses(
      FIXED_EXPENSE_KEYS.map((key) => toCents(data.expenses[key])),
    ),
  );
  const mortgage = safely(() =>
    calculateTenYearMortgageRenewalProjection({
      purchasePriceInCents: toCents(data.property.analyzedPrice),
      downPayment: {
        type: "amount",
        valueInCents: toCents(data.acquisition.downPayment),
      },
      initialAnnualNominalRatePercent: data.financing.initialRate,
      renewalAnnualNominalRatePercent: data.financing.renewalRate,
      firstTermYears: data.financing.firstTermYears,
      amortizationYears: data.financing.amortizationYears,
      startDate: data.financing.startDate,
    }),
  );

  return calculateProjectionFromFinancialInputs(
    data,
    grossRevenue,
    fixedOperatingExpenses,
    projectionMortgageSchedule(data, mortgage?.schedule),
  );
}

function calculatePotentialOnlyResults(data: ManualAnalysisData) {
  const hasPotentialRevenue = data.revenues.some(
    (revenue) =>
      Number.isFinite(revenue.potentialMonthlyRent) &&
      revenue.potentialMonthlyRent > 0,
  );

  if (!hasPotentialRevenue) return null;

  // Chaque loyer potentiel saisi remplace le loyer actuel du même logement.
  // Lorsqu'il est absent, le loyer actuel est conservé sans être additionné.
  const potentialMonthlyRents =
    getPotentialMonthlyRentsWithCurrentFallback(data.revenues);
  const monthlyGrossInCents = potentialMonthlyRents.map(toCents);
  const grossRevenue = safely(() => calculateAnnualGrossRevenue(monthlyGrossInCents));
  const fixedOperatingExpenses = safely(() =>
    calculateOperatingExpenses(
      FIXED_EXPENSE_KEYS.map((key) => toCents(data.expenses[key])),
    ),
  );
  const managementExpense = grossRevenue === null
    ? null
    : safely(() => calculateManagementExpense(grossRevenue, data.expenses.management));
  const operatingExpenses = fixedOperatingExpenses === null || managementExpense === null
    ? null
    : safely(() => calculateOperatingExpenses([fixedOperatingExpenses, managementExpense]));
  const firstYearOperations = calculateFirstYearOperatingResults(
    grossRevenue,
    operatingExpenses,
    data.projection.vacancyRate,
    data.projection.badDebtRate,
  );
  const analyzedPriceInCents = toCents(data.property.analyzedPrice);
  const mortgage = safely(() =>
    calculateTenYearMortgageRenewalProjection({
      purchasePriceInCents: analyzedPriceInCents,
      downPayment: {
        type: "amount",
        valueInCents: toCents(data.acquisition.downPayment),
      },
      initialAnnualNominalRatePercent: data.financing.initialRate,
      renewalAnnualNominalRatePercent: data.financing.renewalRate,
      firstTermYears: data.financing.firstTermYears,
      amortizationYears: data.financing.amortizationYears,
      startDate: data.financing.startDate,
    }),
  );
  const initialInvestment = safely(() =>
    calculateInitialInvestment(
      toCents(data.acquisition.downPayment),
      [
        data.acquisition.welcomeTax,
        data.acquisition.notary,
        data.acquisition.inspection,
        data.acquisition.other,
      ].map(toCents),
      [toCents(data.acquisition.immediateWorks)],
      0,
    ),
  );
  const tenYearProjection = calculateProjectionFromFinancialInputs(
    data,
    grossRevenue,
    fixedOperatingExpenses,
    projectionMortgageSchedule(data, mortgage?.schedule),
  );
  const firstProjectionYear = tenYearProjection[0] ?? null;
  const firstYearNetOperatingIncome = firstYearOperations.netOperatingIncome;
  const mrb = grossRevenue !== null
    ? safely(() =>
        calculateGrossRentMultiplier(
          analyzedPriceInCents,
          grossRevenue,
        ),
      )
    : null;
  const mrn = firstYearNetOperatingIncome !== null
    ? safely(() =>
        calculateNetIncomeMultiplier(
          analyzedPriceInCents,
          firstYearNetOperatingIncome,
        ),
      )
    : null;
  const capitalizationRate = firstYearNetOperatingIncome !== null
    ? safely(() =>
        calculateCapitalizationRate(
          firstYearNetOperatingIncome,
          analyzedPriceInCents,
        ),
      )
    : null;
  const downPaymentReturn = firstProjectionYear
    ? safely(() =>
        calculateDownPaymentReturn(
          firstProjectionYear.cashFlowAfterMajorWorksInCents,
          toCents(data.acquisition.downPayment),
        ),
      )
    : null;
  const initialInvestmentReturn =
    firstProjectionYear && initialInvestment !== null
      ? safely(() =>
          calculateInitialInvestmentReturn(
            firstProjectionYear.cashFlowAfterMajorWorksInCents,
            initialInvestment,
          ),
        )
      : null;
  const dscr = firstProjectionYear
    ? safely(() =>
        calculateDebtServiceCoverageRatio(
          firstProjectionYear.netOperatingIncomeInCents,
          firstProjectionYear.mortgagePaymentsInCents,
        ),
      )
    : null;

  return {
    grossRevenue,
    effectiveRevenue: firstYearOperations.effectiveRevenue,
    operatingExpenses,
    netOperatingIncome: firstYearOperations.netOperatingIncome,
    mrb,
    mrn,
    capitalizationRate,
    mortgagePayment: mortgage?.initialMonthlyPaymentInCents ?? null,
    annualCashFlow: firstProjectionYear?.cashFlowAfterMajorWorksInCents ?? null,
    monthlyCashFlow:
      firstProjectionYear === null
        ? null
        : firstProjectionYear.cashFlowAfterMajorWorksInCents / 12,
    downPaymentReturn,
    initialInvestmentReturn,
    dscr,
    firstYearPrincipal: firstProjectionYear?.principalRepaidInCents ?? null,
    firstYearInterest: firstProjectionYear?.interestPaidInCents ?? null,
    initialInvestment,
    tenYearProjection,
    hasIncompleteFinancing: mortgage === null,
    hasInvalidValues: mortgage === null || tenYearProjection.length !== 10,
  };
}

interface MoneyInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  emphasized?: boolean;
}

interface NumericInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange" | "inputMode"
  > {
  value: number;
  onValueChange: (value: number) => void;
  acceptFormattedMoney?: boolean;
}

function NumericInput({
  value,
  onValueChange,
  min = 0,
  max,
  acceptFormattedMoney = false,
  ...inputProps
}: NumericInputProps) {
  const displayValue = (numericValue: number) => numericValue === 0 ? "" : String(numericValue);
  const [draft, setDraft] = useState(() => displayValue(value));
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current) setDraft(displayValue(value));
  }, [value]);

  const parseDraft = (rawValue: string) => {
    if (acceptFormattedMoney) return parseLocalizedMoney(rawValue);
    const parsed = Number(rawValue.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const commitDraft = (rawValue: string) => {
    const parsed = parseDraft(rawValue);
    const minimum = Number(min);
    const maximum = max === undefined ? null : Number(max);
    const fallback = Number.isFinite(minimum) ? minimum : 0;
    const nextValue = parsed === null ? fallback : parsed;
    const boundedValue = maximum !== null && Number.isFinite(maximum)
      ? Math.min(Math.max(nextValue, fallback), maximum)
      : Math.max(nextValue, fallback);

    setDraft(rawValue.trim() === "" && boundedValue === 0 ? "" : String(boundedValue));
    onValueChange(boundedValue);
  };

  return (
    <input
      {...inputProps}
      type="text"
      inputMode="decimal"
      min={min}
      max={max}
      value={draft}
      onFocus={() => {
        isEditing.current = true;
        if (value === 0) setDraft("");
      }}
      onDoubleClick={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const nextDraft = event.currentTarget.value;
        const isAllowed = acceptFormattedMoney
          ? /^[\d\s\u00a0\u202f.,$]*$/.test(nextDraft)
          : /^\d*(?:[.,]\d*)?$/.test(nextDraft);
        if (!isAllowed) return;

        setDraft(nextDraft);
        if (nextDraft === "" || nextDraft === "," || nextDraft === ".") return;

        const parsed = parseDraft(nextDraft);
        if (parsed !== null) onValueChange(parsed);
      }}
      onBlur={(event) => {
        isEditing.current = false;
        commitDraft(event.currentTarget.value);
      }}
    />
  );
}

function MoneyInput({ id, label, value, onChange, emphasized = false }: MoneyInputProps) {
  return (
    <label className={`field ${emphasized ? "field-emphasized" : ""}`} htmlFor={id}>
      <span>{label}</span>
      <span className="money-control">
        <NumericInput
          id={id}
          min="0"
          step="100"
          acceptFormattedMoney
          value={value}
          onValueChange={onChange}
        />
        <span aria-hidden="true">$</span>
      </span>
    </label>
  );
}

interface ResultCardProps {
  id: string;
  label: string;
  value: string;
  featured?: boolean;
}

function ResultCard({ id, label, value, featured = false }: ResultCardProps) {
  return (
    <div className={`result-card ${featured ? "result-card-featured" : ""}`}>
      <span>{label}</span>
      <strong data-testid={id}>{value}</strong>
    </div>
  );
}

type ProjectionDetailKey = Exclude<keyof AnnualFinancialProjection, "year">;

const PROJECTION_DETAIL_FIELDS: readonly {
  label: string;
  key: ProjectionDetailKey;
}[] = [
  { label: "Revenus bruts", key: "grossRevenueInCents" },
  { label: "Vacance", key: "vacancyLossInCents" },
  { label: "Mauvaises créances", key: "badDebtLossInCents" },
  { label: "Revenus effectifs", key: "effectiveGrossRevenueInCents" },
  { label: "Dépenses courantes", key: "operatingExpensesInCents" },
  { label: "RNO", key: "netOperatingIncomeInCents" },
  { label: "Paiements hypothécaires", key: "mortgagePaymentsInCents" },
  { label: "Capital remboursé", key: "principalRepaidInCents" },
  { label: "Intérêts payés", key: "interestPaidInCents" },
  { label: "Travaux majeurs", key: "majorWorksInCents" },
  { label: "Frais d’acquisition (année 1)", key: "acquisitionCostsInCents" },
  { label: "Flux avant travaux", key: "cashFlowBeforeMajorWorksInCents" },
  { label: "Flux après travaux", key: "cashFlowAfterMajorWorksInCents" },
  { label: "Flux cumulatif", key: "cumulativeCashFlowInCents" },
  { label: "Solde hypothécaire", key: "mortgageBalanceInCents" },
  { label: "Valeur estimée", key: "estimatedPropertyValueInCents" },
  { label: "Équité estimée", key: "estimatedEquityInCents" },
];

const PROJECTION_CASH_FLOW_DETAIL_KEYS = new Set<ProjectionDetailKey>([
  "cashFlowBeforeMajorWorksInCents",
  "cashFlowAfterMajorWorksInCents",
  "cumulativeCashFlowInCents",
]);

function financialValueClass(valueInCents: number | null): string {
  if (valueInCents === null || valueInCents === 0) {
    return "financial-value-neutral";
  }
  return valueInCents > 0
    ? "financial-value-positive"
    : "financial-value-negative";
}

function ProjectionCashFlowCell({
  projection,
  scenario,
  year,
  appreciationEnabled,
  analyzedPropertyValueInCents,
  cumulativePrincipalRepaidInCents,
}: {
  projection: AnnualFinancialProjection | null;
  scenario: "current" | "potential";
  year: number;
  appreciationEnabled: boolean;
  analyzedPropertyValueInCents: number;
  cumulativePrincipalRepaidInCents: number | null;
}) {
  const annualCashFlowInCents =
    projection?.cashFlowAfterMajorWorksInCents ?? null;
  const cumulativeCashFlowInCents =
    projection?.cumulativeCashFlowInCents ?? null;
  const includesAppreciation =
    scenario === "potential" &&
    appreciationEnabled &&
    projection !== null;
  const cumulativeAppreciationInCents = includesAppreciation
    ? projection.estimatedPropertyValueInCents - analyzedPropertyValueInCents
    : 0;
  const cumulativeEnrichmentInCents =
    cumulativeCashFlowInCents === null || cumulativePrincipalRepaidInCents === null
      ? null
      : cumulativeCashFlowInCents +
        cumulativePrincipalRepaidInCents +
        cumulativeAppreciationInCents;
  const testIdPrefix = `projection-year-${year}-${scenario}`;

  return (
    <td className="projection-cashflow-cell">
      <div className="projection-cashflow-values">
        <strong
          className={`projection-cashflow-annual ${financialValueClass(annualCashFlowInCents)}`}
          data-testid={`${testIdPrefix}-annual`}
          data-value-in-cents={annualCashFlowInCents ?? ""}
        >
          {compactMoney(annualCashFlowInCents)} / année
        </strong>
        <span
          className={`projection-cashflow-monthly ${financialValueClass(annualCashFlowInCents)}`}
          data-testid={`${testIdPrefix}-monthly`}
          data-value-in-cents={
            annualCashFlowInCents === null ? "" : annualCashFlowInCents / 12
          }
        >
          {compactMoney(
            annualCashFlowInCents === null ? null : annualCashFlowInCents / 12,
          )} / mois
        </span>
        <small
          className={`projection-cashflow-cumulative ${financialValueClass(cumulativeEnrichmentInCents)}`}
          data-testid={`${testIdPrefix}-cumulative`}
          data-value-in-cents={cumulativeEnrichmentInCents ?? ""}
          data-cashflow-cumulative-in-cents={cumulativeCashFlowInCents ?? ""}
          data-principal-cumulative-in-cents={cumulativePrincipalRepaidInCents ?? ""}
          data-appreciation-in-cents={cumulativeAppreciationInCents}
        >
          Enrichissement cumulé : {compactMoney(cumulativeEnrichmentInCents)}
        </small>
        {cumulativePrincipalRepaidInCents !== null && (
          <span
            className="projection-principal-included"
            data-testid={`${testIdPrefix}-principal`}
            data-value-in-cents={cumulativePrincipalRepaidInCents}
            title="Le capital hypothécaire remboursé augmente l’enrichissement, mais ne représente pas du cash disponible."
          >
            Inclut {compactMoney(cumulativePrincipalRepaidInCents)} de capital remboursé
          </span>
        )}
        {includesAppreciation && (
          <span
            className="projection-appreciation-included"
            data-testid={`${testIdPrefix}-appreciation`}
            data-value-in-cents={cumulativeAppreciationInCents}
            title="La prise de valeur est une plus-value estimée non encaissée. Elle est incluse uniquement dans le cumul potentiel."
          >
            Inclut {compactMoney(cumulativeAppreciationInCents)} de prise de valeur
          </span>
        )}
      </div>
    </td>
  );
}

function ProjectionYearDetails({
  current,
  potential,
  year,
}: {
  current: AnnualFinancialProjection | null;
  potential: AnnualFinancialProjection | null;
  year: number;
}) {
  return (
    <div
      className="projection-details-panel"
      id={`projection-year-${year}-details`}
      data-testid={`projection-year-${year}-details`}
    >
      <div className="projection-details-table-wrap">
        <table className="projection-details-table">
          <caption className="sr-only">
            Détails financiers de l’année {year}
          </caption>
          <thead>
            <tr>
              <th scope="col">Information</th>
              <th scope="col">Actuel</th>
              <th scope="col">Potentiel</th>
            </tr>
          </thead>
          <tbody>
            {PROJECTION_DETAIL_FIELDS.map((field) => {
              const currentValue = current?.[field.key] ?? null;
              const potentialValue = potential?.[field.key] ?? null;
              const isShared =
                current !== null &&
                potential !== null &&
                currentValue === potentialValue;
              const currentValueClass = PROJECTION_CASH_FLOW_DETAIL_KEYS.has(
                field.key,
              )
                ? financialValueClass(currentValue)
                : undefined;
              const potentialValueClass = PROJECTION_CASH_FLOW_DETAIL_KEYS.has(
                field.key,
              )
                ? financialValueClass(potentialValue)
                : undefined;

              return (
                <tr
                  key={field.key}
                  data-testid={`projection-year-${year}-detail-${field.key}`}
                  data-shared={isShared ? "true" : "false"}
                >
                  <th scope="row">{field.label}</th>
                  {isShared ? (
                    <td
                      className={`projection-details-shared ${currentValueClass ?? ""}`}
                      colSpan={2}
                      data-value-in-cents={currentValue ?? ""}
                    >
                      {compactMoney(currentValue)}
                      <span className="sr-only">, identique pour les deux scénarios</span>
                    </td>
                  ) : (
                    <>
                      <td
                        className={currentValueClass}
                        data-scenario="current"
                        data-value-in-cents={currentValue ?? ""}
                      >
                        {compactMoney(currentValue)}
                      </td>
                      <td
                        className={potentialValueClass}
                        data-scenario="potential"
                        data-value-in-cents={potentialValue ?? ""}
                      >
                        {compactMoney(potentialValue)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface MonthlyAmortizationTableProps {
  entries: readonly RenewalProjectionScheduleEntry[];
  initialRate: number;
  renewalRate: number;
  firstTermYears: number;
}

function MonthlyAmortizationTable({
  entries,
  initialRate,
  renewalRate,
  firstTermYears,
}: MonthlyAmortizationTableProps) {
  if (entries.length === 0) {
    return (
      <div className="monthly-amortization-empty" role="status">
        Le tableau apparaîtra dès qu’un prix d’achat analysé permettra de
        calculer le financement.
      </div>
    );
  }

  return (
    <>
      <p className="monthly-amortization-note">
        Taux initial de {initialRate.toLocaleString("fr-CA")} % jusqu’au mois{" "}
        {firstTermYears * 12}, puis taux estimé de{" "}
        {renewalRate.toLocaleString("fr-CA")} % maintenu pour le reste de cet
        échéancier.
      </p>
      <div
        className="monthly-amortization-table-wrap"
        role="region"
        aria-label="Tableau des versements hypothécaires mensuels"
        tabIndex={0}
      >
        <table className="monthly-amortization-table">
          <thead>
            <tr>
              <th scope="col">Mois</th>
              <th scope="col">Taux</th>
              <th scope="col">Versement</th>
              <th scope="col">Intérêts</th>
              <th scope="col">Capital</th>
              <th scope="col">Solde résiduel</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.projectionMonth}
                className={
                  entry.projectionMonth === firstTermYears * 12 + 1
                    ? "renewal-start-row"
                    : undefined
                }
              >
                <th scope="row">{entry.projectionMonth}</th>
                <td>{ratio(entry.annualNominalRatePercent, " %")}</td>
                <td>{money(entry.paymentInCents)}</td>
                <td>{money(entry.interestInCents)}</td>
                <td>{money(entry.principalInCents)}</td>
                <td>{money(entry.closingBalanceInCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function extractedValue(
  field: ExtractedField<unknown>,
  manualValue?: number,
): string {
  const value = manualValue === undefined ? field.value : manualValue;
  if (value === null) return "Information manquante";
  if (typeof value === "number" && field.key === "management") {
    return `${value.toLocaleString("fr-CA")} %`;
  }
  if (typeof value === "number" && (field.key.includes("price") || field.key.includes("revenue") || field.key.includes("income") || field.key.includes("tax") || field.key.includes("rent") || EXPENSE_FIELDS.some(([key]) => key === field.key))) {
    return field.key.includes("rent") ? `${value.toLocaleString("fr-CA")} $ / mois` : `${value.toLocaleString("fr-CA")} $`;
  }
  return String(value);
}

function ExtractionRow({ row }: { row: PdfReviewRow }) {
  const { field, manualValue } = row;
  const manuallyEntered = manualValue !== undefined;
  const confidence = { high: "Élevée", medium: "Moyenne", low: "Faible", none: "Aucune" }[field.confidence];
  const status = field.status === "confirmed" ? "Confirmé" : field.status === "to_review" ? "À vérifier" : "Information manquante";
  return (
    <tr className={manuallyEntered ? "extraction-manual" : field.status === "missing" ? "extraction-missing" : field.status === "to_review" ? "extraction-review" : ""}>
      <td>{field.label}</td>
      <td><strong>{extractedValue(field, manualValue)}</strong></td>
      <td>{manuallyEntered ? "—" : confidence}</td>
      <td>{manuallyEntered ? "Utilisateur" : field.page ? `Page ${field.page}` : "—"}</td>
      <td>
        <span className={`extraction-status extraction-status-${manuallyEntered ? "manual" : field.status}`}>
          {manuallyEntered ? "Saisie manuelle" : status}
        </span>
      </td>
    </tr>
  );
}

export function ManualAnalysisApp() {
  const [data, setData] = useState<ManualAnalysisData>(createEmptyAnalysis);
  const [pdfExtraction, setPdfExtraction] = useState<CentrisExtraction | null>(null);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfDragActive, setPdfDragActive] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [manualEdits, setManualEdits] = useState<Set<string>>(() => new Set());
  const [monthlyScheduleOpen, setMonthlyScheduleOpen] = useState(false);
  const [expandedProjectionYears, setExpandedProjectionYears] = useState<Set<number>>(
    () => new Set(),
  );

  const markManualEdit = (key: string) => {
    setManualEdits((current) => new Set(current).add(key));
  };

  useEffect(() => {
    if (!monthlyScheduleOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMonthlyScheduleOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [monthlyScheduleOpen]);

  const results = useMemo(() => {
    const selectedMonthlyRent = (revenue: RevenueRow) =>
      getMonthlyRentForScenario(revenue, data.activeRevenueScenario);
    const monthlyGrossInCents = data.revenues.map((revenue) => {
      const otherMonthlyIncome =
        data.activeRevenueScenario === "potential"
          ? 0
          : revenue.otherMonthlyIncome;
      return toCents(selectedMonthlyRent(revenue) + otherMonthlyIncome);
    });
    const grossRevenue = safely(() => calculateAnnualGrossRevenue(monthlyGrossInCents));
    const fixedOperatingExpenses = safely(() =>
      calculateOperatingExpenses(
        FIXED_EXPENSE_KEYS.map((key) => toCents(data.expenses[key])),
      ),
    );
    const managementExpense = grossRevenue === null
      ? null
      : safely(() => calculateManagementExpense(grossRevenue, data.expenses.management));
    const operatingExpenses = fixedOperatingExpenses === null || managementExpense === null
      ? null
      : safely(() => calculateOperatingExpenses([fixedOperatingExpenses, managementExpense]));
    const firstYearOperations = calculateFirstYearOperatingResults(
      grossRevenue,
      operatingExpenses,
      data.projection.vacancyRate,
      data.projection.badDebtRate,
    );
    const analyzedPriceInCents = toCents(data.property.analyzedPrice);
    const mortgage = safely(() =>
      calculateTenYearMortgageRenewalProjection({
        purchasePriceInCents: analyzedPriceInCents,
        downPayment: { type: "amount", valueInCents: toCents(data.acquisition.downPayment) },
        initialAnnualNominalRatePercent: data.financing.initialRate,
        renewalAnnualNominalRatePercent: data.financing.renewalRate,
        firstTermYears: data.financing.firstTermYears,
        amortizationYears: data.financing.amortizationYears,
        startDate: data.financing.startDate,
      }),
    );
    const initialInvestment = safely(() =>
      calculateInitialInvestment(
        toCents(data.acquisition.downPayment),
        [
          data.acquisition.welcomeTax,
          data.acquisition.notary,
          data.acquisition.inspection,
          data.acquisition.other,
        ].map(toCents),
        [toCents(data.acquisition.immediateWorks)],
        0,
      ),
    );
    const tenYearProjection = calculateProjectionFromFinancialInputs(
      data,
      grossRevenue,
      fixedOperatingExpenses,
      mortgage?.schedule ?? null,
    );
    const firstProjectionYear = tenYearProjection[0] ?? null;
    const firstYearNetOperatingIncome = firstYearOperations.netOperatingIncome;
    const firstYearEffectiveRevenue = firstYearOperations.effectiveRevenue;
    const projectedMrb = grossRevenue !== null
      ? safely(() =>
          calculateGrossRentMultiplier(
            analyzedPriceInCents,
            grossRevenue,
          ),
        )
      : null;
    const projectedMrn = firstYearNetOperatingIncome !== null
      ? safely(() =>
          calculateNetIncomeMultiplier(
            analyzedPriceInCents,
            firstYearNetOperatingIncome,
          ),
        )
      : null;
    const projectedCapitalizationRate = firstYearNetOperatingIncome !== null
      ? safely(() =>
          calculateCapitalizationRate(
            firstYearNetOperatingIncome,
            analyzedPriceInCents,
          ),
        )
      : null;
    const projectedDownPaymentReturn = firstProjectionYear
      ? safely(() =>
          calculateDownPaymentReturn(
            firstProjectionYear.cashFlowAfterMajorWorksInCents,
            toCents(data.acquisition.downPayment),
          ),
        )
      : null;
    const projectedInitialInvestmentReturn =
      firstProjectionYear && initialInvestment !== null
        ? safely(() =>
            calculateInitialInvestmentReturn(
              firstProjectionYear.cashFlowAfterMajorWorksInCents,
              initialInvestment,
            ),
          )
        : null;
    const projectedDscr = firstProjectionYear
      ? safely(() =>
          calculateDebtServiceCoverageRatio(
            firstProjectionYear.netOperatingIncomeInCents,
            firstProjectionYear.mortgagePaymentsInCents,
          ),
        )
      : null;
    const projectedExpenseRatio =
      operatingExpenses !== null && firstYearEffectiveRevenue !== null
      ? safely(() =>
          calculateExpenseRatio(
            operatingExpenses,
            firstYearEffectiveRevenue,
          ),
        )
      : null;

    return {
      activeScenarioLabel: REVENUE_SCENARIO_LABELS[data.activeRevenueScenario],
      grossRevenue,
      effectiveRevenue: firstYearOperations.effectiveRevenue,
      operatingExpenses,
      netOperatingIncome: firstYearOperations.netOperatingIncome,
      mrb: projectedMrb,
      mrn: projectedMrn,
      capitalizationRate: projectedCapitalizationRate,
      mortgagePayment: mortgage?.initialMonthlyPaymentInCents ?? null,
      financedAmount: mortgage?.financedAmountInCents ?? null,
      annualCashFlow: firstProjectionYear?.cashFlowAfterMajorWorksInCents ?? null,
      monthlyCashFlow:
        firstProjectionYear === null
          ? null
          : firstProjectionYear.cashFlowAfterMajorWorksInCents / 12,
      downPaymentReturn: projectedDownPaymentReturn,
      initialInvestmentReturn: projectedInitialInvestmentReturn,
      dscr: projectedDscr,
      expenseRatio: projectedExpenseRatio,
      firstYearPrincipal: firstProjectionYear?.principalRepaidInCents ?? null,
      firstYearInterest: firstProjectionYear?.interestPaidInCents ?? null,
      initialInvestment,
      tenYearProjection,
      mortgageAmortizationSchedule:
        mortgage?.fullAmortizationSchedule ?? [],
      hasIncompleteFinancing: mortgage === null,
      hasInvalidValues:
        mortgage === null || tenYearProjection.length !== 10,
    };
  }, [data]);

  const potentialResults = useMemo(
    () => calculatePotentialOnlyResults(data),
    [data],
  );
  const currentTenYearProjection = useMemo(
    () => calculateCurrentOnlyTenYearProjection(data),
    [data],
  );
  const potentialRentCount = data.revenues.filter(
    (revenue) =>
      Number.isFinite(revenue.potentialMonthlyRent) &&
      revenue.potentialMonthlyRent > 0,
  ).length;
  const cashFlowOutlook = useMemo(
    () => evaluateCashFlowOutlook(results.tenYearProjection),
    [results.tenYearProjection],
  );
  const displayedMonthlyMortgageSchedule =
    results.mortgageAmortizationSchedule.slice(
      0,
      MAX_MONTHLY_AMORTIZATION_ROWS,
    );
  const pdfReviewRows = useMemo(
    () =>
      pdfExtraction === null
        ? []
        : buildPdfReviewRows(pdfExtraction, data.expenses, manualEdits),
    [data.expenses, manualEdits, pdfExtraction],
  );

  const updateProperty = (key: keyof ManualAnalysisData["property"], value: string | number) => {
    markManualEdit(`property.${key}`);
    setData((current) => ({
      ...current,
      property: { ...current.property, [key]: value },
    }));
  };

  const updateRevenue = (id: string, patch: Partial<RevenueRow>) => {
    Object.keys(patch).forEach((key) => markManualEdit(`revenue.${id}.${key}`));
    setData((current) => ({
      ...current,
      revenues: current.revenues.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    }));
  };

  const updateAcquisition = (
    key: keyof ManualAnalysisData["acquisition"],
    value: number,
  ) => {
    markManualEdit(`acquisition.${key}`);
    setData((current) => ({
      ...current,
      acquisition: { ...current.acquisition, [key]: value },
    }));
  };

  const updateFinancing = (
    key: keyof ManualAnalysisData["financing"],
    value: string | number,
  ) => {
    markManualEdit(`financing.${key}`);
    setData((current) => ({
      ...current,
      financing: { ...current.financing, [key]: value },
    }));
  };

  const updateProjection = (
    key: keyof ManualAnalysisData["projection"],
    value: number | boolean,
  ) => {
    setData((current) => ({
      ...current,
      projection: { ...current.projection, [key]: value },
    }));
  };

  const updateExpense = (key: ExpenseKey, value: number) => {
    markManualEdit(`expense.${key}`);
    setData((current) => ({ ...current, expenses: { ...current.expenses, [key]: value } }));
  };

  const resetPotentialRents = () => {
    setData((current) => ({
      ...current,
      revenues: current.revenues.map((row) => ({
        ...row,
        potentialMonthlyRent: 0,
      })),
    }));
    setManualEdits((current) => new Set(
      [...current].filter(
        (key) => !(key.startsWith("revenue.") && key.endsWith(".potentialMonthlyRent")),
      ),
    ));
  };

  const resetExpenses = () => {
    setData((current) => ({
      ...current,
      expenses: { ...EMPTY_DATA.expenses },
    }));
    setManualEdits((current) => new Set(
      [...current].filter((key) => !key.startsWith("expense.")),
    ));
  };

  const resetMajorWorks = () => {
    setData((current) => ({
      ...current,
      majorWorks: structuredClone(EMPTY_DATA.majorWorks),
    }));
  };

  const resetAcquisitionCosts = () => {
    setData((current) => ({
      ...current,
      acquisition: { ...EMPTY_DATA.acquisition },
    }));
    setManualEdits((current) => new Set(
      [...current].filter((key) => !key.startsWith("acquisition.")),
    ));
  };

  const resetAnalysis = () => {
    setData(createEmptyAnalysis());
    setPdfExtraction(null);
    setPdfDragActive(false);
    setPdfProgress(null);
    setPdfError(null);
    setPdfNotice(null);
    setManualEdits(new Set());
    setMonthlyScheduleOpen(false);
    setExpandedProjectionYears(new Set());
  };

  const importPdf = async (file: File) => {
    setPdfImporting(true);
    setPdfProgress(0);
    setPdfError(null);
    setPdfNotice(null);
    try {
      const extraction = await extractCentrisPdf(file, setPdfProgress);
      const application = applyCentrisExtraction(data, extraction, manualEdits);
      setData(applyStartingFinancingDefaults(application.data, manualEdits));
      setPdfExtraction(extraction);
      setPdfProgress(100);
      const priceNotice = application.analyzedPriceInitialized ? " Le prix analysé a été initialisé avec le prix demandé extrait afin d’alimenter la calculatrice." : "";
      const assumptionsNotice = " Le financement démarre à 100 % du prix analysé, à 5 % sur 25 ans avec un premier renouvellement après 5 ans au taux estimé de 6 %. Les taux, les frais d’acquisition et les hypothèses de projection demeurent modifiables et ne proviennent pas du PDF.";
      setPdfNotice(application.protectedLabels.length > 0 ? `${application.protectedLabels.length} correction(s) manuelle(s) conservée(s) : ${application.protectedLabels.join(", ")}.${priceNotice}${assumptionsNotice}` : `Les données trouvées ont été transférées dans les champs existants.${priceNotice}${assumptionsNotice}`);
    } catch {
      setPdfProgress(100);
      setPdfError("Le PDF n’a pas pu être lu. Vérifiez qu’il contient du texte sélectionnable et qu’il n’est pas protégé.");
    } finally {
      setPdfImporting(false);
    }
  };

  const selectPdf = (file: File) => {
    if (pdfImporting) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setPdfProgress(null);
      setPdfError("Seuls les fichiers PDF sont acceptés.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPdfProgress(null);
      setPdfError("Le fichier dépasse la limite de 20 Mo.");
      return;
    }
    void importPdf(file);
  };

  const handlePdfDrag = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (pdfImporting) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.dataTransfer.dropEffect = "copy";
    setPdfDragActive(true);
  };

  const analyzedPropertyValueInCents = toCents(data.property.analyzedPrice);
  const projectedPropertyValueAfterOneYearInCents = data.projection.appreciationEnabled
    ? analyzedPropertyValueInCents * (1 + data.projection.annualAppreciation / 100)
    : analyzedPropertyValueInCents;

  const housingRentValue = (
    row: RevenueRow,
    index: number,
    key: "currentMonthlyRent" | "potentialMonthlyRent",
  ): string => {
    const extractedUnit = pdfExtraction?.units[index];
    const extractedRent = key === "currentMonthlyRent"
      ? extractedUnit?.currentMonthlyRent
      : extractedUnit?.potentialMonthlyRent;
    const isKnown =
      manualEdits.has(`revenue.${row.id}.${key}`) ||
      (extractedRent !== undefined && extractedRent.value !== null) ||
      row[key] > 0;

    return isKnown
      ? `${row[key].toLocaleString("fr-CA")} $ / mois`
      : "Information manquante";
  };

  const undetailedPdfUnitCount = pdfExtraction?.units.filter(
    (unit) => unit.description.value === null,
  ).length ?? 0;

  return (
    <main className="analysis-app">
      <header className="plex-header">
        <div
          className={`cash-flow-outlook cash-flow-outlook-${cashFlowOutlook.color}`}
          data-testid="cash-flow-outlook"
          data-color={cashFlowOutlook.color}
          role="status"
          aria-live="polite"
        >
          <span>Projection · {results.activeScenarioLabel}</span>
          <strong>{cashFlowOutlook.label}</strong>
          <small>{cashFlowOutlook.explanation}</small>
        </div>
        <div className="header-actions">
          <nav className="header-nav" aria-label="Navigation principale">
            <a href="#pdf-import-heading">Importer</a>
            <a href="#property-heading">Données</a>
            <a href="#ten-year-heading">Projection</a>
          </nav>
          <button className="secondary-button" type="button" onClick={resetAnalysis}>
            Nouvelle analyse
          </button>
        </div>
      </header>

      <div className="editorial-hero" role="region" aria-labelledby="analysis-title">
        <div className="editorial-hero-title">
          <span className="eyebrow">Analyse immobilière</span>
          <h1 id="analysis-title">
            Analyse d’immeuble
            <span>à revenus</span>
          </h1>
        </div>
        <div className="editorial-hero-copy">
          <span className="editorial-rule" aria-hidden="true" />
          <p>
            Importez votre fiche Centris, ajustez les hypothèses et analysez
            instantanément la rentabilité, le financement et le cashflow de
            l’immeuble.
          </p>
        </div>
      </div>

      <div className="analysis-workspace">
        <div className="input-column">
          <section className="form-section pdf-import-section" aria-labelledby="pdf-import-heading">
            <div className="section-heading">
              <span>00</span>
              <div>
                <h2 id="pdf-import-heading">Importation d’une fiche Centris</h2>
                <p>Le PDF remplit les champs manuels existants; aucune donnée n’est inventée.</p>
              </div>
            </div>
            {pdfProgress !== null && (
              <div className={`pdf-progress${pdfError && !pdfImporting ? " has-error" : ""}`} role="status" aria-live="polite">
                <div>
                  <strong>{pdfImporting ? "Lecture du PDF en cours" : pdfError ? "Lecture interrompue" : "Lecture terminée"}</strong>
                  <span>{pdfProgress} %</span>
                </div>
                <progress aria-label="Progression de la lecture du PDF" max={100} value={pdfProgress} />
              </div>
            )}
            <label
              className={`pdf-drop-zone${pdfDragActive ? " is-dragging" : ""}`}
              htmlFor="centris-pdf-input"
              onDragEnter={handlePdfDrag}
              onDragOver={handlePdfDrag}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setPdfDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setPdfDragActive(false);
                if (pdfImporting) return;
                if (event.dataTransfer.files.length > 1) {
                  setPdfProgress(null);
                  setPdfError("Déposez un seul fichier PDF à la fois.");
                  return;
                }
                const file = event.dataTransfer.files[0];
                if (file) selectPdf(file);
              }}
            >
              <span className="pdf-upload-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" />
                </svg>
              </span>
              <strong>
                {pdfImporting
                  ? "Lecture du PDF…"
                  : pdfDragActive
                    ? "Déposez le PDF ici"
                    : "Glissez votre fiche Centris ici ou cliquez pour la choisir"}
              </strong>
              <span className="pdf-select-action">Choisir un fichier PDF</span>
              <span>PDF avec texte sélectionnable · maximum 20 Mo · traitement local dans l’application</span>
              <input
                id="centris-pdf-input"
                type="file"
                accept="application/pdf,.pdf"
                disabled={pdfImporting}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  selectPdf(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {pdfNotice && <div className="pdf-notice" role="status">{pdfNotice}</div>}
            {pdfError && <div className="pdf-error" role="alert">{pdfError}</div>}
          </section>

          <section className="form-section" aria-labelledby="property-heading">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h2 id="property-heading">Informations sur la propriété</h2>
                <p>Le prix demandé est informatif; le prix analysé dirige les calculs.</p>
              </div>
            </div>
            <div className="field-grid field-grid-property">
              <label className="field field-wide" htmlFor="property-address">
                <span>Adresse</span>
                <input
                  id="property-address"
                  value={data.property.address}
                  onChange={(event) => updateProperty("address", event.currentTarget.value)}
                />
              </label>
              <label className="field" htmlFor="property-type">
                <span>Type d’immeuble</span>
                <select
                  id="property-type"
                  value={data.property.propertyType}
                  onChange={(event) => updateProperty("propertyType", event.currentTarget.value)}
                >
                  <option value="">Sélectionner…</option>
                  <option>Duplex</option>
                  <option>Triplex</option>
                  <option>Multiplex</option>
                  <option>Autre</option>
                </select>
              </label>
              <label className="field" htmlFor="unit-count">
                <span>Nombre de logements</span>
                <NumericInput
                  id="unit-count"
                  min="1"
                  step="1"
                  value={data.property.unitCount}
                  onValueChange={(value) => updateProperty("unitCount", value)}
                />
              </label>
              <MoneyInput
                id="asking-price"
                label="Prix demandé"
                value={data.property.askingPrice}
                onChange={(value) => updateProperty("askingPrice", value)}
              />
            </div>
          </section>

          {pdfExtraction && (
            <section className="form-section pdf-review-section" aria-labelledby="pdf-review-heading">
              <div className="extraction-review-heading">
                <div>
                  <strong id="pdf-review-heading">{pdfExtraction.fileName}</strong>
                  <span>{pdfExtraction.pageCount} page(s) analysée(s)</span>
                </div>
                <span>{pdfReviewRows.filter((row) => row.field.value !== null).length} donnée(s) générale(s) trouvée(s)</span>
              </div>
              <div className="data-table-wrap">
                <table className="extraction-table">
                  <thead><tr><th>Donnée</th><th>Valeur</th><th>Confiance</th><th>Source</th><th>Statut</th></tr></thead>
                  <tbody>
                    {pdfReviewRows.map((row) => <ExtractionRow row={row} key={row.field.key} />)}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="analysis-price-section" aria-labelledby="analyzed-price-heading">
            <div>
              <span className="control-label">Variable maîtresse</span>
              <h2 id="analyzed-price-heading">Prix d’achat analysé</h2>
              <p>Ce montant contrôle les ratios, le financement et les rendements.</p>
            </div>
            <MoneyInput
              id="analyzed-price"
              label="Prix utilisé dans tous les calculs"
              value={data.property.analyzedPrice}
              onChange={(value) => updateProperty("analyzedPrice", value)}
              emphasized
            />
          </section>

          <section className="form-section" aria-labelledby="revenue-heading">
            <div className="section-heading section-heading-with-action">
              <span>02</span>
              <div>
                <h2 id="revenue-heading">Revenus</h2>
                <p>Les logements vacants sont retranchés des revenus bruts effectifs.</p>
              </div>
              <button
                className="section-reset-button"
                type="button"
                onClick={resetPotentialRents}
              >
                Réinitialiser les loyers potentiels
              </button>
            </div>
            <div className="scenario-selector" aria-label="Scénario de revenus actif">
              <div>
                <span className="control-label">Scénario utilisé</span>
                <strong data-testid="active-scenario-input">
                  {REVENUE_SCENARIO_LABELS[data.activeRevenueScenario]}
                </strong>
              </div>
              <div className="scenario-options">
                {(["current", "potential"] as const).map((scenario) => (
                  <button
                    key={scenario}
                    type="button"
                    aria-pressed={data.activeRevenueScenario === scenario}
                    className={data.activeRevenueScenario === scenario ? "active" : ""}
                    onClick={() =>
                      setData((current) => ({
                        ...current,
                        activeRevenueScenario: scenario,
                      }))
                    }
                  >
                    {REVENUE_SCENARIO_LABELS[scenario]}
                  </button>
                ))}
              </div>
            </div>
            {data.activeRevenueScenario === "potential" && (
              <div className="potential-warning" role="note">
                Les loyers potentiels doivent être validés par le courtier et peuvent ne pas
                être immédiatement réalisables.
              </div>
            )}
            <div className="data-table-wrap">
              <table className="data-table revenue-table">
                <thead>
                  <tr>
                    <th>Description du logement</th>
                    <th className={data.activeRevenueScenario === "current" ? "scenario-column-active" : ""}>Loyer actuel</th>
                    <th className={data.activeRevenueScenario === "potential" ? "scenario-column-active" : ""}>Loyer potentiel</th>
                    <th>Statut</th>
                    <th>Autres revenus</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenues.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          aria-label={`Description de ${row.description}`}
                          value={row.description}
                          onChange={(event) => updateRevenue(row.id, { description: event.currentTarget.value })}
                        />
                      </td>
                      <td>
                        <NumericInput
                          id={`rent-current-${row.id}`}
                          aria-label={`Loyer actuel de ${row.description}`}
                          min="0"
                          step="25"
                          acceptFormattedMoney
                          className={data.activeRevenueScenario === "current" ? "scenario-input-active" : ""}
                          value={row.currentMonthlyRent}
                          onValueChange={(value) => updateRevenue(row.id, { currentMonthlyRent: value })}
                        />
                      </td>
                      <td>
                        <NumericInput
                          id={`rent-potential-${row.id}`}
                          aria-label={`Loyer potentiel de ${row.description}`}
                          min="0"
                          step="25"
                          acceptFormattedMoney
                          className={data.activeRevenueScenario === "potential" ? "scenario-input-active" : ""}
                          value={row.potentialMonthlyRent}
                          onValueChange={(value) => updateRevenue(row.id, { potentialMonthlyRent: value })}
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Statut de ${row.description}`}
                          value={row.status}
                          onChange={(event) => updateRevenue(row.id, { status: event.currentTarget.value as RevenueRow["status"] })}
                        >
                          <option value="">Sélectionner…</option>
                          <option value="occupied">Occupé</option>
                          <option value="vacant">Vacant</option>
                        </select>
                      </td>
                      <td>
                        <NumericInput
                          aria-label={`Autres revenus de ${row.description}`}
                          min="0"
                          step="25"
                          acceptFormattedMoney
                          value={row.otherMonthlyIncome}
                          onValueChange={(value) => updateRevenue(row.id, { otherMonthlyIncome: value })}
                        />
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Supprimer ${row.description}`}
                          onClick={() => setData((current) => ({
                            ...current,
                            revenues: current.revenues.filter((item) => item.id !== row.id),
                          }))}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="add-button"
              type="button"
              onClick={() => setData((current) => ({
                ...current,
                revenues: [
                  ...current.revenues,
                  {
                    id: `unit-${Date.now()}`,
                    description: "",
                    currentMonthlyRent: 0,
                    potentialMonthlyRent: 0,
                    customMonthlyRent: 0,
                    status: "",
                    otherMonthlyIncome: 0,
                  },
                ],
              }))}
            >
              + Ajouter un logement
            </button>
          </section>

          <section className="form-section" aria-labelledby="expenses-heading">
            <div className="section-heading section-heading-with-action">
              <span>03</span>
              <div>
                <h2 id="expenses-heading">Dépenses courantes</h2>
                <p>Montants annuels; la gestion est calculée en pourcentage des revenus bruts.</p>
              </div>
              <button
                className="section-reset-button"
                type="button"
                onClick={resetExpenses}
              >
                Réinitialiser les dépenses
              </button>
            </div>
            <div className="expense-grid">
              {EXPENSE_FIELDS.map(([key, label]) => key === "management" ? (
                <label className="field" htmlFor="expense-management" key={key}>
                  <span>{label}</span>
                  <span className="suffix-control">
                    <NumericInput
                      id="expense-management"
                      min="0"
                      max="100"
                      step="0.1"
                      value={data.expenses.management}
                      onValueChange={(value) => updateExpense("management", value)}
                    />
                    <span aria-hidden="true">%</span>
                  </span>
                </label>
              ) : (
                <MoneyInput
                  key={key}
                  id={`expense-${key}`}
                  label={label}
                  value={data.expenses[key]}
                  onChange={(value) => updateExpense(key, value)}
                />
              ))}
            </div>
          </section>

          <section className="form-section" aria-labelledby="works-heading">
            <div className="section-heading section-heading-with-action">
              <span>04</span>
              <div>
                <h2 id="works-heading">Travaux majeurs</h2>
                <p>L’année prévue correspond à l’année 1 à 10 de la projection.</p>
              </div>
              <button
                className="section-reset-button"
                type="button"
                onClick={resetMajorWorks}
              >
                Réinitialiser les travaux
              </button>
            </div>
            <div className="data-table-wrap">
              <table className="data-table works-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Année prévue</th>
                    <th>Montant</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.majorWorks.map((work) => (
                    <tr key={work.id}>
                      <td>
                        <input
                          aria-label="Description des travaux"
                          value={work.description}
                          onChange={(event) => setData((current) => ({
                            ...current,
                            majorWorks: current.majorWorks.map((item) =>
                              item.id === work.id ? { ...item, description: event.currentTarget.value } : item,
                            ),
                          }))}
                        />
                      </td>
                      <td>
                        <NumericInput
                          aria-label={`Année prévue pour ${work.description}`}
                          min="1"
                          max="10"
                          value={work.projectedYear}
                          onValueChange={(value) => setData((current) => ({
                            ...current,
                            majorWorks: current.majorWorks.map((item) =>
                              item.id === work.id ? { ...item, projectedYear: value } : item,
                            ),
                          }))}
                        />
                      </td>
                      <td>
                        <NumericInput
                          aria-label={`Montant pour ${work.description}`}
                          min="0"
                          step="500"
                          acceptFormattedMoney
                          value={work.amount}
                          onValueChange={(value) => setData((current) => ({
                            ...current,
                            majorWorks: current.majorWorks.map((item) =>
                              item.id === work.id ? { ...item, amount: value } : item,
                            ),
                          }))}
                        />
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Supprimer ${work.description}`}
                          onClick={() => setData((current) => ({
                            ...current,
                            majorWorks: current.majorWorks.filter((item) => item.id !== work.id),
                          }))}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="add-button"
              type="button"
              onClick={() => setData((current) => ({
                ...current,
                majorWorks: [
                  ...current.majorWorks,
                  { id: `work-${Date.now()}`, description: "Nouveaux travaux", projectedYear: 1, amount: 0 },
                ],
              }))}
            >
              + Ajouter des travaux
            </button>
          </section>

          <section className="form-section" aria-labelledby="acquisition-heading">
            <div className="section-heading section-heading-with-action">
              <span>05</span>
              <div>
                <h2 id="acquisition-heading">Frais d’acquisition</h2>
                <p>
                  Les frais fixes sont déduits une seule fois du cashflow de l’année 1
                  et ne réduisent jamais le RNO.
                </p>
              </div>
              <button
                className="section-reset-button"
                type="button"
                onClick={resetAcquisitionCosts}
              >
                Réinitialiser les frais
              </button>
            </div>
            <div className="expense-grid">
              <MoneyInput id="down-payment" label="Mise de fonds" value={data.acquisition.downPayment} onChange={(value) => updateAcquisition("downPayment", value)} />
              <MoneyInput id="welcome-tax" label="Taxe de bienvenue" value={data.acquisition.welcomeTax} onChange={(value) => updateAcquisition("welcomeTax", value)} />
              <MoneyInput id="notary" label="Notaire" value={data.acquisition.notary} onChange={(value) => updateAcquisition("notary", value)} />
              <MoneyInput id="inspection" label="Inspection" value={data.acquisition.inspection} onChange={(value) => updateAcquisition("inspection", value)} />
              <MoneyInput id="immediate-works" label="Travaux immédiats" value={data.acquisition.immediateWorks} onChange={(value) => updateAcquisition("immediateWorks", value)} />
              <MoneyInput id="other-costs" label="Autres frais" value={data.acquisition.other} onChange={(value) => updateAcquisition("other", value)} />
            </div>
          </section>

          <section className="form-section" aria-labelledby="financing-heading">
            <div className="section-heading">
              <span>06</span>
              <div>
                <h2 id="financing-heading">Financement hypothécaire</h2>
                <p>Taux canadien fixe, paiements mensuels et renouvellement estimé.</p>
              </div>
            </div>
            <div className="financing-summary">
              <span>Montant financé</span>
              <strong data-testid="financed-amount">{money(results.financedAmount)}</strong>
            </div>
            <div className="field-grid financing-grid">
              <label className="field" htmlFor="mortgage-initial-rate">
                <span>Taux initial</span>
                <span className="suffix-control">
                  <NumericInput id="mortgage-initial-rate" min="0" step="0.05" value={data.financing.initialRate} onValueChange={(value) => updateFinancing("initialRate", value)} />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
              <label className="field" htmlFor="mortgage-renewal-rate">
                <span>Taux au renouvellement</span>
                <span className="suffix-control">
                  <NumericInput id="mortgage-renewal-rate" min="0" step="0.05" value={data.financing.renewalRate} onValueChange={(value) => updateFinancing("renewalRate", value)} />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
              <label className="field" htmlFor="amortization-years">
                <span>Amortissement</span>
                <select id="amortization-years" value={data.financing.amortizationYears} onChange={(event) => updateFinancing("amortizationYears", fromInput(event.currentTarget.value))}>
                  <option value="20">20 ans</option>
                  <option value="25">25 ans</option>
                  <option value="30">30 ans</option>
                </select>
              </label>
              <label className="field" htmlFor="first-term-years">
                <span>Durée du premier terme</span>
                <select id="first-term-years" value={data.financing.firstTermYears} onChange={(event) => updateFinancing("firstTermYears", fromInput(event.currentTarget.value))}>
                  <option value="1">1 an</option>
                  <option value="3">3 ans</option>
                  <option value="5">5 ans</option>
                  <option value="7">7 ans</option>
                </select>
              </label>
              <label className="field" htmlFor="mortgage-start-date">
                <span>Date de début</span>
                <input id="mortgage-start-date" type="date" value={data.financing.startDate} onChange={(event) => updateFinancing("startDate", event.currentTarget.value)} />
              </label>
            </div>

            <div
              className="monthly-amortization"
              aria-labelledby="monthly-amortization-heading"
              data-testid="monthly-amortization"
            >
              <div className="monthly-amortization-heading">
                <div>
                  <span className="control-label">Détail hypothécaire</span>
                  <h3 id="monthly-amortization-heading">
                    Versements mensuels jusqu’à 300 mois
                  </h3>
                </div>
                {displayedMonthlyMortgageSchedule.length > 0 && (
                  <strong>
                    {displayedMonthlyMortgageSchedule.length} mois affichés
                  </strong>
                )}
              </div>

              <MonthlyAmortizationTable
                entries={displayedMonthlyMortgageSchedule}
                initialRate={data.financing.initialRate}
                renewalRate={data.financing.renewalRate}
                firstTermYears={data.financing.firstTermYears}
              />
            </div>
          </section>

          <section className="form-section" aria-labelledby="projection-settings-heading">
            <div className="section-heading">
              <span>07</span>
              <div>
                <h2 id="projection-settings-heading">Paramètres de projection</h2>
                <p>Hypothèses annuelles appliquées au scénario actif et au prix d’achat analysé.</p>
              </div>
            </div>
            <div className="field-grid projection-controls-grid">
              <label className="field" htmlFor="annual-rent-increase">
                <span>Augmentation annuelle des loyers</span>
                <span className="suffix-control">
                  <NumericInput
                    id="annual-rent-increase"
                    min="0"
                    step="0.1"
                    value={data.projection.annualRentIncrease}
                    onValueChange={(value) =>
                      updateProjection("annualRentIncrease", value)
                    }
                  />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
              <label className="field" htmlFor="annual-expense-increase">
                <span>Augmentation annuelle des dépenses</span>
                <span className="suffix-control">
                  <NumericInput
                    id="annual-expense-increase"
                    min="0"
                    step="0.1"
                    value={data.projection.annualExpenseIncrease}
                    onValueChange={(value) =>
                      updateProjection("annualExpenseIncrease", value)
                    }
                  />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
              <label className="field" htmlFor="vacancy-rate">
                <span>Taux de vacance</span>
                <span className="suffix-control">
                  <NumericInput
                    id="vacancy-rate"
                    min="0"
                    max="100"
                    step="0.1"
                    value={data.projection.vacancyRate}
                    onValueChange={(value) =>
                      updateProjection("vacancyRate", value)
                    }
                  />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
              <label className="field" htmlFor="bad-debt-rate">
                <span>Mauvaises créances</span>
                <span className="suffix-control">
                  <NumericInput
                    id="bad-debt-rate"
                    min="0"
                    max="100"
                    step="0.1"
                    value={data.projection.badDebtRate}
                    onValueChange={(value) =>
                      updateProjection("badDebtRate", value)
                    }
                  />
                  <span aria-hidden="true">%</span>
                </span>
              </label>
              <div className="appreciation-control">
                <label className="toggle-control" htmlFor="appreciation-enabled">
                  <input
                    id="appreciation-enabled"
                    type="checkbox"
                    checked={data.projection.appreciationEnabled}
                    onChange={(event) =>
                      updateProjection("appreciationEnabled", event.currentTarget.checked)
                    }
                  />
                  <span aria-hidden="true" />
                  <strong>Prise de valeur de l’immeuble</strong>
                </label>
                <label className="field" htmlFor="annual-appreciation">
                  <span>Prise de valeur annuelle</span>
                  <span className="suffix-control">
                    <NumericInput
                      id="annual-appreciation"
                      min="0"
                      step="0.1"
                      disabled={!data.projection.appreciationEnabled}
                      value={data.projection.annualAppreciation}
                      onValueChange={(value) =>
                        updateProjection("annualAppreciation", value)
                      }
                    />
                    <span aria-hidden="true">%</span>
                  </span>
                </label>
                <div className="appreciation-preview" data-testid="appreciation-preview">
                  <span>Valeur projetée après 1 an</span>
                  <strong>{money(projectedPropertyValueAfterOneYearInCents)}</strong>
                  <small>
                    Prix analysé {money(analyzedPropertyValueInCents)}
                    {data.projection.appreciationEnabled
                      ? ` + ${data.projection.annualAppreciation.toLocaleString("fr-CA")} %`
                      : " · prise de valeur désactivée"}
                  </small>
                </div>
              </div>
            </div>
            <p className="projection-rate-note">
              Les taux hypothécaires initial et renouvelé sont modifiables dans la section
              Financement hypothécaire ci-dessus.
            </p>
          </section>

        </div>

        <div className="results-column-group">
        <aside className="results-panel" aria-labelledby="results-heading">
          <div className="results-heading-row">
            <div>
              <span className="control-label">Mise à jour en direct</span>
              <h2 id="results-heading">Résultats financiers</h2>
            </div>
            <span className="live-dot" aria-label="Calculs actifs" />
          </div>
          <div className="active-scenario-banner">
            <span>Scénario actif</span>
            <strong data-testid="active-scenario-results">
              {results.activeScenarioLabel}
            </strong>
          </div>
          {results.hasInvalidValues && (
            <div className="calculation-warning" role="status">
              {results.hasIncompleteFinancing
                ? "Les résultats opérationnels sont affichés. Complétez le financement pour calculer les paiements, les flux de trésorerie, les rendements et le DSCR."
                : "Ajustez les valeurs invalides pour compléter tous les résultats."}
            </div>
          )}
          <div className="result-overview">
            <div><span>Revenus bruts</span><strong>{money(results.grossRevenue)}</strong></div>
            <div><span>Revenus effectifs</span><strong>{money(results.effectiveRevenue)}</strong></div>
            <div><span>Dépenses</span><strong>{money(results.operatingExpenses)}</strong></div>
          </div>
          <div className="result-grid">
            <ResultCard id="result-mrb" label="MRB" value={ratio(results.mrb, "×")} />
            <ResultCard id="result-mrn" label="MRN" value={ratio(results.mrn, "×")} />
            <ResultCard id="result-cap-rate" label="Taux de capitalisation" value={ratio(results.capitalizationRate, " %")} featured />
            <ResultCard id="result-noi" label="Revenu net d’exploitation" value={money(results.netOperatingIncome)} featured />
            <ResultCard id="result-mortgage-payment" label="Paiement hypothécaire" value={money(results.mortgagePayment)} />
            <ResultCard id="result-monthly-cash-flow" label="Flux de trésorerie mensuel" value={money(results.monthlyCashFlow)} />
            <ResultCard id="result-annual-cash-flow" label="Flux de trésorerie annuel" value={money(results.annualCashFlow)} featured />
            <ResultCard id="result-down-payment-return" label="Rendement sur mise de fonds" value={ratio(results.downPaymentReturn, " %")} />
            <ResultCard id="result-initial-return" label="Rendement sur investissement initial" value={ratio(results.initialInvestmentReturn, " %")} />
            <ResultCard id="result-dscr" label="DSCR" value={ratio(results.dscr, "×")} />
            <ResultCard id="result-year-one-principal" label="Capital remboursé · année 1" value={money(results.firstYearPrincipal)} />
            <ResultCard id="result-year-one-interest" label="Intérêts payés · année 1" value={money(results.firstYearInterest)} />
          </div>
          <button
            className="mortgage-schedule-open-button"
            type="button"
            onClick={() => setMonthlyScheduleOpen(true)}
            disabled={displayedMonthlyMortgageSchedule.length === 0}
          >
            <span>Tableau hypothécaire détaillé</span>
            <strong>
              {displayedMonthlyMortgageSchedule.length > 0
                ? `Voir les ${displayedMonthlyMortgageSchedule.length} mois`
                : "Disponible après le calcul"}
            </strong>
          </button>
          <div className="investment-total">
            <span>Investissement initial total</span>
            <strong>{money(results.initialInvestment)}</strong>
          </div>
          <p className="result-note">
            Tous les calculs utilisent le prix d’achat analysé. Aucun document PDF n’est requis.
          </p>
        </aside>

        <aside
          className="results-panel results-panel-potential"
          aria-labelledby="potential-results-heading"
          data-testid="potential-only-results"
        >
          <div className="results-heading-row">
            <div>
              <span className="control-label">Comparaison en direct</span>
              <h2 id="potential-results-heading">Résultats potentiels</h2>
            </div>
            <span className="live-dot" aria-label="Calculs potentiels actifs" />
          </div>
          <div className="active-scenario-banner">
            <span>Scénario combiné</span>
            <strong>Potentiel saisi, sinon loyer actuel</strong>
          </div>

          {potentialResults === null ? (
            <div className="potential-results-empty" role="status">
              Entrez au moins un loyer dans la colonne « Loyer potentiel » pour
              afficher cette comparaison. Les autres logements conserveront leur
              loyer actuel.
            </div>
          ) : (
            <>
              {potentialResults.hasInvalidValues && (
                <div className="calculation-warning" role="status">
                  {potentialResults.hasIncompleteFinancing
                    ? "Les résultats opérationnels potentiels sont affichés. Complétez le financement pour calculer les résultats hypothécaires."
                    : "Ajustez les valeurs invalides pour compléter tous les résultats."}
                </div>
              )}
              <div className="result-overview">
                <div><span>Revenus bruts</span><strong>{money(potentialResults.grossRevenue)}</strong></div>
                <div><span>Revenus effectifs</span><strong>{money(potentialResults.effectiveRevenue)}</strong></div>
                <div><span>Dépenses</span><strong>{money(potentialResults.operatingExpenses)}</strong></div>
              </div>
              <div className="result-grid">
                <ResultCard id="potential-result-mrb" label="MRB" value={ratio(potentialResults.mrb, "×")} />
                <ResultCard id="potential-result-mrn" label="MRN" value={ratio(potentialResults.mrn, "×")} />
                <ResultCard id="potential-result-cap-rate" label="Taux de capitalisation" value={ratio(potentialResults.capitalizationRate, " %")} featured />
                <ResultCard id="potential-result-noi" label="Revenu net d’exploitation" value={money(potentialResults.netOperatingIncome)} featured />
                <ResultCard id="potential-result-mortgage-payment" label="Paiement hypothécaire" value={money(potentialResults.mortgagePayment)} />
                <ResultCard id="potential-result-monthly-cash-flow" label="Flux de trésorerie mensuel" value={money(potentialResults.monthlyCashFlow)} />
                <ResultCard id="potential-result-annual-cash-flow" label="Flux de trésorerie annuel" value={money(potentialResults.annualCashFlow)} featured />
                <ResultCard id="potential-result-down-payment-return" label="Rendement sur mise de fonds" value={ratio(potentialResults.downPaymentReturn, " %")} />
                <ResultCard id="potential-result-initial-return" label="Rendement sur investissement initial" value={ratio(potentialResults.initialInvestmentReturn, " %")} />
                <ResultCard id="potential-result-dscr" label="DSCR" value={ratio(potentialResults.dscr, "×")} />
                <ResultCard id="potential-result-year-one-principal" label="Capital remboursé · année 1" value={money(potentialResults.firstYearPrincipal)} />
                <ResultCard id="potential-result-year-one-interest" label="Intérêts payés · année 1" value={money(potentialResults.firstYearInterest)} />
              </div>
              <button
                className="mortgage-schedule-open-button"
                type="button"
                onClick={() => setMonthlyScheduleOpen(true)}
                disabled={displayedMonthlyMortgageSchedule.length === 0}
                aria-label="Ouvrir le tableau hypothécaire détaillé depuis les résultats potentiels"
              >
                <span>Tableau hypothécaire détaillé</span>
                <strong>
                  {displayedMonthlyMortgageSchedule.length > 0
                    ? `Voir les ${displayedMonthlyMortgageSchedule.length} mois`
                    : "Disponible après le calcul"}
                </strong>
              </button>
              <div className="investment-total">
                <span>Investissement initial total</span>
                <strong>{money(potentialResults.initialInvestment)}</strong>
              </div>
            </>
          )}
          <p className="result-note">
            Pour chaque logement, le loyer potentiel remplace le loyer actuel
            lorsqu’il est saisi; sinon le loyer actuel est conservé. Les deux loyers
            ne sont jamais additionnés. Les autres revenus restent réservés au
            scénario actuel.
          </p>
        </aside>

        {pdfExtraction && (
          <section
            className="unit-description-panel"
            aria-labelledby="unit-description-heading"
            data-testid="unit-description-panel"
          >
            <div className="unit-description-heading">
              <div>
                <span className="control-label">Fiche descriptive</span>
                <h2 id="unit-description-heading">Description des logements</h2>
                <p>
                  Les renseignements affichés suivent les champs modifiables de
                  l’analyse et ne complètent jamais une donnée absente.
                </p>
              </div>
              <div className="unit-property-summary">
                <div>
                  <span>Adresse de l’immeuble</span>
                  <strong>{data.property.address.trim() || "Information manquante"}</strong>
                </div>
                <div>
                  <span>Nombre de logements</span>
                  <strong>
                    {data.property.unitCount > 0
                      ? data.property.unitCount.toLocaleString("fr-CA")
                      : "Information manquante"}
                  </strong>
                </div>
              </div>
            </div>

            <div className="unit-description-table-wrap">
              <table className="unit-description-table">
                <thead>
                  <tr>
                    <th>Logement et nombre de pièces</th>
                    <th>Loyer actuel</th>
                    <th>Loyer potentiel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenues.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="unit-description-empty">
                        Information manquante : aucune description de logement n’a été trouvée.
                      </td>
                    </tr>
                  ) : (
                    data.revenues.map((row, index) => {
                      const currentRent = housingRentValue(row, index, "currentMonthlyRent");
                      const potentialRent = housingRentValue(row, index, "potentialMonthlyRent");
                      return (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.description.trim() || "Information manquante"}</strong>
                          </td>
                          <td className={currentRent === "Information manquante" ? "is-missing" : ""}>
                            {currentRent}
                          </td>
                          <td className={potentialRent === "Information manquante" ? "is-missing" : ""}>
                            {potentialRent}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {undetailedPdfUnitCount > 0 && (
              <p className="unit-coverage-note" data-testid="unit-coverage-warning">
                {undetailedPdfUnitCount.toLocaleString("fr-CA")} logement(s) déclaré(s) dans la
                fiche n’ont pas pu être détaillés. Les lignes correspondantes restent visibles
                comme « Information manquante » afin qu’aucune donnée ne soit inventée.
              </p>
            )}

            {((pdfExtraction.currentAnnualRevenue.value !== null && pdfExtraction.units.length === 0) ||
              (pdfExtraction.potentialAnnualRevenue.value !== null &&
                pdfExtraction.units.some((unit) => unit.potentialMonthlyRent.value === null))) && (
              <p className="aggregate-revenue-note">
                Un total annuel a été trouvé sans ventilation complète par logement. Il est
                affiché pour vérification, mais n’est pas réparti dans les loyers mensuels afin
                de ne rien inventer.
              </p>
            )}
          </section>
        )}
        </div>
      </div>

      <section className="ten-year-panel" aria-labelledby="ten-year-heading">
        <div className="ten-year-heading-row">
          <div>
            <span className="control-label">Projection financière détaillée</span>
            <h2 id="ten-year-heading">Exactement dix ans</h2>
            <p>
              Revenus, exploitation, financement, travaux, valeur et équité à la fin de
              chaque année, comparés selon les revenus actuels et potentiels.
            </p>
          </div>
          <div className="projection-context" data-testid="projection-comparison-legend">
            <span>Comparaison en direct</span>
            <div className="projection-legend-items">
              <strong className="projection-legend-current">
                <i aria-hidden="true" /> Revenus actuels
              </strong>
              <strong className="projection-legend-potential">
                <i aria-hidden="true" /> Revenus potentiels
              </strong>
            </div>
            <small data-testid="appreciation-status">
              Prise de valeur {data.projection.appreciationEnabled ? `${data.projection.annualAppreciation.toLocaleString("fr-CA")} % par an` : "désactivée"}
            </small>
          </div>
        </div>
        <p
          className="projection-comparison-note"
          data-testid="projection-potential-scope"
        >
          {potentialResults === null
            ? "Aucun loyer potentiel saisi : le scénario potentiel reprend les loyers actuels sans les compter deux fois."
            : `Scénario potentiel : ${potentialRentCount.toLocaleString("fr-CA")} loyer(s) potentiel(s) remplacent le loyer actuel correspondant; les autres logements conservent leur loyer actuel. Aucun logement n’est compté deux fois.${potentialResults.tenYearProjection.length !== 10 ? " Complétez les données requises pour afficher les montants projetés." : ""}`}
        </p>
        <p className="projection-wealth-note" data-testid="projection-wealth-note">
          L’enrichissement cumulé combine le cashflow après travaux et le capital
          hypothécaire remboursé. Dans le scénario potentiel, la prise de valeur
          estimée est également incluse lorsqu’elle est activée. Le capital et la
          prise de valeur ne représentent pas du cash disponible.
        </p>
        {data.projection.appreciationEnabled && (
          <p
            className="projection-appreciation-disclaimer"
            data-testid="projection-appreciation-disclaimer"
          >
            La prise de valeur est une plus-value estimée non encaissée. Elle est
            incluse uniquement dans le cumul potentiel.
          </p>
        )}
        <div className="ten-year-table-wrap">
          <table className="ten-year-table">
            <caption className="sr-only">
              Comparaison du cashflow actuel et potentiel sur dix ans
            </caption>
            <thead>
              <tr>
                <th scope="col">Année</th>
                <th scope="col">Cashflow actuel</th>
                <th scope="col">Cashflow potentiel</th>
                <th scope="col">Écart</th>
                <th scope="col">Détails</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }, (_, index) => {
                const yearNumber = index + 1;
                const currentYear = currentTenYearProjection.find(
                  (projection) => projection.year === yearNumber,
                ) ?? null;
                const potentialYear = potentialResults === null
                  ? currentYear
                  : potentialResults.tenYearProjection.find(
                      (projection) => projection.year === yearNumber,
                    ) ?? null;
                const annualGapInCents =
                  currentYear === null || potentialYear === null
                    ? null
                    : potentialYear.cashFlowAfterMajorWorksInCents -
                      currentYear.cashFlowAfterMajorWorksInCents;
                const cumulativePrincipalRepaidInCents =
                  currentYear === null
                    ? null
                    : currentTenYearProjection
                        .filter((projection) => projection.year <= yearNumber)
                        .reduce(
                          (total, projection) =>
                            total + projection.principalRepaidInCents,
                          0,
                        );
                const detailsAreExpanded =
                  expandedProjectionYears.has(yearNumber);

                return (
                  <Fragment key={yearNumber}>
                    <tr
                      className="projection-summary-row"
                      data-testid={`projection-year-${yearNumber}`}
                    >
                      <th className="projection-year-cell" scope="row">
                        {yearNumber}
                      </th>
                      <ProjectionCashFlowCell
                        projection={currentYear}
                        scenario="current"
                        year={yearNumber}
                        appreciationEnabled={data.projection.appreciationEnabled}
                        analyzedPropertyValueInCents={analyzedPropertyValueInCents}
                        cumulativePrincipalRepaidInCents={cumulativePrincipalRepaidInCents}
                      />
                      <ProjectionCashFlowCell
                        projection={potentialYear}
                        scenario="potential"
                        year={yearNumber}
                        appreciationEnabled={data.projection.appreciationEnabled}
                        analyzedPropertyValueInCents={analyzedPropertyValueInCents}
                        cumulativePrincipalRepaidInCents={cumulativePrincipalRepaidInCents}
                      />
                      <td className="projection-gap">
                        <strong
                          className={financialValueClass(annualGapInCents)}
                          data-testid={`projection-year-${yearNumber}-gap`}
                          data-value-in-cents={annualGapInCents ?? ""}
                        >
                          {compactMoney(annualGapInCents)}
                        </strong>
                      </td>
                      <td className="projection-details-cell">
                        <button
                          className="projection-details-toggle"
                          type="button"
                          aria-expanded={detailsAreExpanded}
                          aria-controls={`projection-year-${yearNumber}-details`}
                          data-testid={`projection-year-${yearNumber}-details-toggle`}
                          onClick={() =>
                            setExpandedProjectionYears((current) => {
                              const next = new Set(current);
                              if (next.has(yearNumber)) {
                                next.delete(yearNumber);
                              } else {
                                next.add(yearNumber);
                              }
                              return next;
                            })
                          }
                        >
                          {detailsAreExpanded
                            ? "Masquer les détails"
                            : "Afficher les détails"}
                          <span
                            className="projection-details-chevron"
                            aria-hidden="true"
                          >
                            ▾
                          </span>
                        </button>
                      </td>
                    </tr>
                    <tr
                      className="projection-details-row"
                      hidden={!detailsAreExpanded}
                    >
                      <td colSpan={5}>
                        <ProjectionYearDetails
                          current={currentYear}
                          potential={potentialYear}
                          year={yearNumber}
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {monthlyScheduleOpen && (
        <div
          className="mortgage-schedule-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setMonthlyScheduleOpen(false);
            }
          }}
        >
          <section
            className="mortgage-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mortgage-schedule-modal-heading"
            data-testid="mortgage-schedule-modal"
          >
            <div className="mortgage-schedule-modal-heading">
              <div>
                <span className="control-label">Calculatrice hypothécaire</span>
                <h2 id="mortgage-schedule-modal-heading">
                  Capital et intérêts par mois
                </h2>
                <p>
                  {displayedMonthlyMortgageSchedule.length} versements détaillés,
                  du premier paiement jusqu’au mois 300.
                </p>
              </div>
              <button
                className="mortgage-schedule-modal-close"
                type="button"
                onClick={() => setMonthlyScheduleOpen(false)}
                aria-label="Fermer le tableau hypothécaire"
              >
                Fermer <span aria-hidden="true">×</span>
              </button>
            </div>
            <MonthlyAmortizationTable
              entries={displayedMonthlyMortgageSchedule}
              initialRate={data.financing.initialRate}
              renewalRate={data.financing.renewalRate}
              firstTermYears={data.financing.firstTermYears}
            />
          </section>
        </div>
      )}
    </main>
  );
}
