export interface DemoDossier {
  id: "rentable" | "near-thresholds" | "not-profitable";
  label: string;
  expectedResult: "green" | "yellow" | "red";
  purchasePrice: number;
  downPayment: number;
  monthlyRents: { current: number[]; potential: number[]; custom: number[] };
  annualExpenses: number[];
  acquisitionCosts: number[];
  immediateWorks: number;
  initialReserve: number;
  majorWorks: { year: number; amount: number }[];
  vacancyRate: number;
  badDebtRate: number;
  initialRate: number;
  renewalRate: number;
  amortizationYears: number;
  firstTermYears: number;
  annualRentIncrease: number;
  annualExpenseIncrease: number;
  annualAppreciation: number;
  criteria: {
    maximumMrb: number;
    maximumMrn: number;
    minimumCapitalizationRate: number;
    minimumMonthlyCashFlow: number;
    minimumInitialInvestmentReturn: number;
    minimumDscr: number;
    maximumExpenseRatio: number;
  };
}

export const DEMO_DOSSIERS: readonly DemoDossier[] = [
  {
    id: "rentable",
    label: "Immeuble rentable",
    expectedResult: "green",
    purchasePrice: 480_000,
    downPayment: 144_000,
    monthlyRents: { current: [2_000, 1_900, 1_800, 300], potential: [2_150, 2_050, 1_950, 300], custom: [2_050, 1_975, 1_875, 300] },
    annualExpenses: [4_100, 450, 2_200, 700, 900, 1_500, 1_400, 900, 900, 2_400, 1_200],
    acquisitionCosts: [6_000, 1_800, 900, 650, 250],
    immediateWorks: 2_500,
    initialReserve: 8_000,
    majorWorks: [{ year: 6, amount: 12_000 }],
    vacancyRate: 2,
    badDebtRate: 1,
    initialRate: 4.5,
    renewalRate: 5.25,
    amortizationYears: 25,
    firstTermYears: 5,
    annualRentIncrease: 3,
    annualExpenseIncrease: 2,
    annualAppreciation: 2,
    criteria: { maximumMrb: 10, maximumMrn: 14, minimumCapitalizationRate: 7, minimumMonthlyCashFlow: 1_500, minimumInitialInvestmentReturn: 8, minimumDscr: 1.5, maximumExpenseRatio: 30 },
  },
  {
    id: "near-thresholds",
    label: "Immeuble près des seuils",
    expectedResult: "yellow",
    purchasePrice: 675_000,
    downPayment: 135_000,
    monthlyRents: { current: [1_700, 1_550, 1_500], potential: [1_850, 1_700, 1_650], custom: [1_750, 1_600, 1_550] },
    annualExpenses: [5_200, 550, 2_400, 600, 900, 1_000, 1_500, 0, 0, 2_400, 500],
    acquisitionCosts: [8_500, 2_000, 1_000, 750, 500],
    immediateWorks: 5_000,
    initialReserve: 10_000,
    majorWorks: [{ year: 3, amount: 18_000 }],
    vacancyRate: 2,
    badDebtRate: 1,
    initialRate: 5,
    renewalRate: 6,
    amortizationYears: 25,
    firstTermYears: 5,
    annualRentIncrease: 3,
    annualExpenseIncrease: 2,
    annualAppreciation: 3,
    criteria: { maximumMrb: 12, maximumMrn: 17, minimumCapitalizationRate: 5.8, minimumMonthlyCashFlow: 200, minimumInitialInvestmentReturn: 1.7, minimumDscr: 1.1, maximumExpenseRatio: 30 },
  },
  {
    id: "not-profitable",
    label: "Immeuble non rentable",
    expectedResult: "red",
    purchasePrice: 950_000,
    downPayment: 95_000,
    monthlyRents: { current: [1_600, 1_500, 1_400], potential: [1_750, 1_650, 1_550], custom: [1_650, 1_550, 1_450] },
    annualExpenses: [8_500, 900, 4_500, 1_200, 1_600, 2_800, 3_000, 1_500, 1_500, 3_500, 1_500],
    acquisitionCosts: [14_000, 2_500, 1_200, 900, 1_000],
    immediateWorks: 35_000,
    initialReserve: 15_000,
    majorWorks: [{ year: 2, amount: 45_000 }, { year: 7, amount: 30_000 }],
    vacancyRate: 4,
    badDebtRate: 2,
    initialRate: 6.5,
    renewalRate: 7.25,
    amortizationYears: 25,
    firstTermYears: 5,
    annualRentIncrease: 2,
    annualExpenseIncrease: 3,
    annualAppreciation: 1,
    criteria: { maximumMrb: 12, maximumMrn: 18, minimumCapitalizationRate: 5, minimumMonthlyCashFlow: 0, minimumInitialInvestmentReturn: 2, minimumDscr: 1.2, maximumExpenseRatio: 40 },
  },
] as const;
