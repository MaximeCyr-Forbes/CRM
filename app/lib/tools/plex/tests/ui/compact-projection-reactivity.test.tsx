// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { ManualAnalysisApp } from "@/app/lib/tools/plex/components/manual/ManualAnalysisApp";

afterEach(() => {
  cleanup();
});

function inputById(id: string): HTMLInputElement {
  const input = document.getElementById(id);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Le champ #${id} est introuvable.`);
  }
  return input;
}

async function replaceInput(
  user: UserEvent,
  input: HTMLInputElement,
  value: string | number,
) {
  await user.clear(input);
  await user.type(input, String(value));
  await user.tab();
}

async function replaceInputById(
  user: UserEvent,
  id: string,
  value: string | number,
) {
  await replaceInput(user, inputById(id), value);
}

function valueInCents(testId: string): number {
  const rawValue = screen
    .getByTestId(testId)
    .getAttribute("data-value-in-cents");

  if (rawValue === null || rawValue === "") {
    throw new Error(`La valeur brute de ${testId} n'est pas disponible.`);
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`La valeur brute de ${testId} n'est pas numérique.`);
  }
  return value;
}

function attributeValueInCents(testId: string, attribute: string): number {
  const rawValue = screen.getByTestId(testId).getAttribute(attribute);

  if (rawValue === null || rawValue === "") {
    throw new Error(`L’attribut ${attribute} de ${testId} n'est pas disponible.`);
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`L’attribut ${attribute} de ${testId} n'est pas numérique.`);
  }
  return value;
}

function detailValueInCents(
  year: number,
  key: string,
  scenario?: "current" | "potential",
): number {
  const row = screen.getByTestId(`projection-year-${year}-detail-${key}`);
  const selector = scenario
    ? `[data-scenario="${scenario}"][data-value-in-cents]`
    : "[data-value-in-cents]";
  const valueElement = row.querySelector(selector);

  if (!(valueElement instanceof HTMLElement)) {
    throw new Error(`La valeur détaillée ${key} de l'année ${year} est introuvable.`);
  }

  const rawValue = valueElement.getAttribute("data-value-in-cents");
  if (rawValue === null || rawValue === "") {
    throw new Error(`La valeur détaillée ${key} de l'année ${year} est vide.`);
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`La valeur détaillée ${key} de l'année ${year} n'est pas numérique.`);
  }
  return value;
}

async function renderValidAnalysis() {
  const user = userEvent.setup();
  render(<ManualAnalysisApp />);

  await replaceInputById(user, "analyzed-price", 500_000);
  await replaceInputById(user, "rent-current-unit-1", 2_000);
  await replaceInputById(user, "rent-potential-unit-1", 2_500);

  await waitFor(() => {
    expect(valueInCents("projection-year-1-current-annual")).toBeTypeOf(
      "number",
    );
    expect(valueInCents("projection-year-1-potential-annual")).toBeTypeOf(
      "number",
    );
  });

  return user;
}

async function openYearDetails(user: UserEvent, year: number) {
  await user.click(screen.getByTestId(`projection-year-${year}-details-toggle`));
  const details = await screen.findByTestId(`projection-year-${year}-details`);
  const detailsRow = details.closest("tr");
  if (!(detailsRow instanceof HTMLTableRowElement)) {
    throw new Error(`La ligne de détails de l’année ${year} est introuvable.`);
  }
  await waitFor(() => expect(detailsRow.hidden).toBe(false));
  return details;
}

async function openYearOneDetails(user: UserEvent) {
  return openYearDetails(user, 1);
}

describe("réactivité du tableau compact de projection", { timeout: 10_000 }, () => {
  it("met à jour le cashflow actuel dès qu'un loyer actuel change", async () => {
    const user = await renderValidAnalysis();
    const initialCurrent = valueInCents("projection-year-1-current-annual");
    const initialPotential = valueInCents("projection-year-1-potential-annual");

    expect(
      screen
        .getByTestId("projection-year-1-current-annual")
        .classList.contains("financial-value-negative"),
    ).toBe(true);

    await replaceInputById(user, "rent-current-unit-1", 4_000);

    await waitFor(() => {
      expect(valueInCents("projection-year-1-current-annual")).not.toBe(
        initialCurrent,
      );
      expect(
        screen
          .getByTestId("projection-year-1-current-annual")
          .classList.contains("financial-value-positive"),
      ).toBe(true);
    });
    expect(valueInCents("projection-year-1-potential-annual")).toBe(
      initialPotential,
    );
  });

  it("met à jour uniquement le scénario potentiel quand le loyer potentiel change", async () => {
    const user = await renderValidAnalysis();
    const initialCurrent = valueInCents("projection-year-1-current-annual");
    const initialPotential = valueInCents("projection-year-1-potential-annual");

    await replaceInputById(user, "rent-potential-unit-1", 4_000);

    await waitFor(() => {
      expect(valueInCents("projection-year-1-potential-annual")).not.toBe(
        initialPotential,
      );
      expect(
        screen
          .getByTestId("projection-year-1-potential-annual")
          .classList.contains("financial-value-positive"),
      ).toBe(true);
    });
    expect(valueInCents("projection-year-1-current-annual")).toBe(
      initialCurrent,
    );
  });

  it("répercute une dépense existante sur les deux scénarios", async () => {
    const user = await renderValidAnalysis();
    const initialCurrent = valueInCents("projection-year-1-current-annual");
    const initialPotential = valueInCents("projection-year-1-potential-annual");
    const initialCurrentEnrichment = valueInCents(
      "projection-year-1-current-cumulative",
    );
    const initialPotentialEnrichment = valueInCents(
      "projection-year-1-potential-cumulative",
    );

    await replaceInputById(user, "expense-municipalTaxes", 12_000);

    await waitFor(() => {
      expect(valueInCents("projection-year-1-current-annual")).toBeLessThan(
        initialCurrent,
      );
      expect(valueInCents("projection-year-1-potential-annual")).toBeLessThan(
        initialPotential,
      );
      expect(
        valueInCents("projection-year-1-current-cumulative"),
      ).toBeLessThan(initialCurrentEnrichment);
      expect(
        valueInCents("projection-year-1-potential-cumulative"),
      ).toBeLessThan(initialPotentialEnrichment);
    });
  });

  it("met à jour le paiement hypothécaire et les deux cashflows lorsque le prix change", async () => {
    const user = await renderValidAnalysis();
    await openYearOneDetails(user);

    const mortgageRow = screen.getByTestId(
      "projection-year-1-detail-mortgagePaymentsInCents",
    );
    expect(mortgageRow.getAttribute("data-shared")).toBe("true");

    const initialMortgage = detailValueInCents(
      1,
      "mortgagePaymentsInCents",
    );
    const initialCurrent = valueInCents("projection-year-1-current-annual");
    const initialPotential = valueInCents("projection-year-1-potential-annual");
    const initialPrincipal = attributeValueInCents(
      "projection-year-1-current-cumulative",
      "data-principal-cumulative-in-cents",
    );
    const initialEnrichment = valueInCents(
      "projection-year-1-current-cumulative",
    );

    await replaceInputById(user, "analyzed-price", 650_000);

    await waitFor(() => {
      expect(detailValueInCents(1, "mortgagePaymentsInCents")).toBeGreaterThan(
        initialMortgage,
      );
      expect(valueInCents("projection-year-1-current-annual")).not.toBe(
        initialCurrent,
      );
      expect(valueInCents("projection-year-1-potential-annual")).not.toBe(
        initialPotential,
      );
      expect(
        attributeValueInCents(
          "projection-year-1-current-cumulative",
          "data-principal-cumulative-in-cents",
        ),
      ).not.toBe(initialPrincipal);
      expect(valueInCents("projection-year-1-current-cumulative")).not.toBe(
        initialEnrichment,
      );
    });
  });

  it("met à jour le paiement hypothécaire et les cashflows lorsque le taux change", async () => {
    const user = await renderValidAnalysis();
    await openYearOneDetails(user);

    const initialMortgage = detailValueInCents(
      1,
      "mortgagePaymentsInCents",
    );
    const initialCurrent = valueInCents("projection-year-1-current-annual");
    const initialPotential = valueInCents("projection-year-1-potential-annual");
    const initialPrincipal = attributeValueInCents(
      "projection-year-1-current-cumulative",
      "data-principal-cumulative-in-cents",
    );
    const initialEnrichment = valueInCents(
      "projection-year-1-current-cumulative",
    );

    await replaceInputById(user, "mortgage-initial-rate", 7);

    await waitFor(() => {
      expect(detailValueInCents(1, "mortgagePaymentsInCents")).toBeGreaterThan(
        initialMortgage,
      );
      expect(valueInCents("projection-year-1-current-annual")).toBeLessThan(
        initialCurrent,
      );
      expect(valueInCents("projection-year-1-potential-annual")).toBeLessThan(
        initialPotential,
      );
      expect(
        attributeValueInCents(
          "projection-year-1-current-cumulative",
          "data-principal-cumulative-in-cents",
        ),
      ).not.toBe(initialPrincipal);
      expect(valueInCents("projection-year-1-current-cumulative")).not.toBe(
        initialEnrichment,
      );
    });
  });

  it("met à jour le financement, le capital et l’enrichissement avec la mise de fonds", async () => {
    const user = await renderValidAnalysis();
    await openYearOneDetails(user);

    const initialMortgage = detailValueInCents(1, "mortgagePaymentsInCents");
    const initialPrincipal = attributeValueInCents(
      "projection-year-1-current-cumulative",
      "data-principal-cumulative-in-cents",
    );
    const initialEnrichment = valueInCents(
      "projection-year-1-current-cumulative",
    );

    await replaceInputById(user, "down-payment", 100_000);

    await waitFor(() => {
      expect(detailValueInCents(1, "mortgagePaymentsInCents")).toBeLessThan(
        initialMortgage,
      );
      expect(
        attributeValueInCents(
          "projection-year-1-current-cumulative",
          "data-principal-cumulative-in-cents",
        ),
      ).not.toBe(initialPrincipal);
      expect(valueInCents("projection-year-1-current-cumulative")).not.toBe(
        initialEnrichment,
      );
    });
  });

  it("applique un travail majeur uniquement à l'année sélectionnée", async () => {
    const user = await renderValidAnalysis();
    const yearTwoCurrent = valueInCents("projection-year-2-current-annual");
    const yearThreeCurrent = valueInCents("projection-year-3-current-annual");
    const yearThreePotential = valueInCents(
      "projection-year-3-potential-annual",
    );
    const yearThreeCurrentEnrichment = valueInCents(
      "projection-year-3-current-cumulative",
    );
    const yearThreePotentialEnrichment = valueInCents(
      "projection-year-3-potential-cumulative",
    );
    const worksSection = screen
      .getByRole("heading", { name: "Travaux majeurs" })
      .closest("section");
    if (!(worksSection instanceof HTMLElement)) {
      throw new Error("La section des travaux majeurs est introuvable.");
    }
    const workControls = within(worksSection);
    await replaceInput(
      user,
      workControls.getByLabelText(/^Année prévue pour/) as HTMLInputElement,
      3,
    );
    await replaceInput(
      user,
      workControls.getByLabelText(/^Montant pour/) as HTMLInputElement,
      10_000,
    );

    await waitFor(() => {
      expect(valueInCents("projection-year-3-current-annual")).toBe(
        yearThreeCurrent - 1_000_000,
      );
      expect(valueInCents("projection-year-3-potential-annual")).toBe(
        yearThreePotential - 1_000_000,
      );
      expect(valueInCents("projection-year-3-current-cumulative")).toBeCloseTo(
        yearThreeCurrentEnrichment - 1_000_000,
        8,
      );
      expect(
        valueInCents("projection-year-3-potential-cumulative"),
      ).toBeCloseTo(
        yearThreePotentialEnrichment - 1_000_000,
        8,
      );
    });
    expect(valueInCents("projection-year-2-current-annual")).toBe(
      yearTwoCurrent,
    );
  });

  it("déduit les frais d’acquisition fixes une seule fois en année 1 sans modifier le RNO", async () => {
    const user = await renderValidAnalysis();
    await openYearOneDetails(user);

    const acquisitionCostInCents = 1_200_000;
    const initialYearOneCurrent = valueInCents(
      "projection-year-1-current-annual",
    );
    const initialYearOnePotential = valueInCents(
      "projection-year-1-potential-annual",
    );
    const initialYearTwoCurrent = valueInCents(
      "projection-year-2-current-annual",
    );
    const initialYearTwoPotential = valueInCents(
      "projection-year-2-potential-annual",
    );
    const initialYearOneCurrentCumulative = valueInCents(
      "projection-year-1-current-cumulative",
    );
    const initialYearOnePotentialCumulative = valueInCents(
      "projection-year-1-potential-cumulative",
    );
    const initialYearTwoCurrentCumulative = valueInCents(
      "projection-year-2-current-cumulative",
    );
    const initialYearTwoPotentialCumulative = valueInCents(
      "projection-year-2-potential-cumulative",
    );
    const initialCurrentRno = detailValueInCents(
      1,
      "netOperatingIncomeInCents",
      "current",
    );
    const initialPotentialRno = detailValueInCents(
      1,
      "netOperatingIncomeInCents",
      "potential",
    );

    await replaceInputById(user, "welcome-tax", 12_000);

    await waitFor(() => {
      expect(valueInCents("projection-year-1-current-annual")).toBeCloseTo(
        initialYearOneCurrent - acquisitionCostInCents,
        8,
      );
      expect(valueInCents("projection-year-1-potential-annual")).toBeCloseTo(
        initialYearOnePotential - acquisitionCostInCents,
        8,
      );
    });

    expect(valueInCents("projection-year-2-current-annual")).toBeCloseTo(
      initialYearTwoCurrent,
      8,
    );
    expect(valueInCents("projection-year-2-potential-annual")).toBeCloseTo(
      initialYearTwoPotential,
      8,
    );
    expect(valueInCents("projection-year-1-current-cumulative")).toBeCloseTo(
      initialYearOneCurrentCumulative - acquisitionCostInCents,
      8,
    );
    expect(valueInCents("projection-year-1-potential-cumulative")).toBeCloseTo(
      initialYearOnePotentialCumulative - acquisitionCostInCents,
      8,
    );
    expect(valueInCents("projection-year-2-current-cumulative")).toBeCloseTo(
      initialYearTwoCurrentCumulative - acquisitionCostInCents,
      8,
    );
    expect(valueInCents("projection-year-2-potential-cumulative")).toBeCloseTo(
      initialYearTwoPotentialCumulative - acquisitionCostInCents,
      8,
    );
    expect(
      detailValueInCents(1, "netOperatingIncomeInCents", "current"),
    ).toBeCloseTo(initialCurrentRno, 8);
    expect(
      detailValueInCents(1, "netOperatingIncomeInCents", "potential"),
    ).toBeCloseTo(initialPotentialRno, 8);

    const acquisitionRow = screen.getByTestId(
      "projection-year-1-detail-acquisitionCostsInCents",
    );
    expect(acquisitionRow.getAttribute("data-shared")).toBe("true");
    expect(
      detailValueInCents(1, "acquisitionCostsInCents"),
    ).toBe(acquisitionCostInCents);
  });

  it("dérive toujours le cashflow mensuel du flux annuel après travaux divisé par douze", async () => {
    await renderValidAnalysis();

    for (const scenario of ["current", "potential"] as const) {
      const annual = valueInCents(`projection-year-1-${scenario}-annual`);
      const monthly = valueInCents(`projection-year-1-${scenario}-monthly`);
      expect(monthly).toBeCloseTo(annual / 12, 10);
    }
  });

  it("compose séparément l’enrichissement actuel et potentiel de l’année 1", async () => {
    const user = await renderValidAnalysis();
    await openYearOneDetails(user);

    const currentCashFlow = attributeValueInCents(
      "projection-year-1-current-cumulative",
      "data-cashflow-cumulative-in-cents",
    );
    const potentialCashFlow = attributeValueInCents(
      "projection-year-1-potential-cumulative",
      "data-cashflow-cumulative-in-cents",
    );
    const principal = attributeValueInCents(
      "projection-year-1-current-cumulative",
      "data-principal-cumulative-in-cents",
    );
    const appreciation = valueInCents(
      "projection-year-1-potential-appreciation",
    );
    const currentEnrichment = valueInCents(
      "projection-year-1-current-cumulative",
    );
    const potentialEnrichment = valueInCents(
      "projection-year-1-potential-cumulative",
    );
    const estimatedEquity = detailValueInCents(
      1,
      "estimatedEquityInCents",
    );

    expect(currentEnrichment).toBeCloseTo(currentCashFlow + principal, 8);
    expect(potentialEnrichment).toBeCloseTo(
      potentialCashFlow + principal + appreciation,
      8,
    );
    expect(potentialEnrichment).not.toBeCloseTo(
      potentialCashFlow + principal + appreciation + estimatedEquity,
      2,
    );
    expect(
      screen.getByTestId("projection-year-1-potential-annual").classList,
    ).toContain("financial-value-negative");
    expect(
      screen.getByTestId("projection-year-1-potential-cumulative").classList,
    ).toContain("financial-value-positive");
    expect(screen.getByTestId("projection-wealth-note").textContent).toContain(
      "ne représentent pas du cash disponible",
    );
  });

  it("utilise un capital remboursé cumulatif aux années 5 et 10 sans le doubler", async () => {
    const user = await renderValidAnalysis();
    await openYearDetails(user, 5);
    await openYearDetails(user, 10);

    const initialMortgageInCents = 50_000_000;
    const yearFivePrincipal = attributeValueInCents(
      "projection-year-5-current-cumulative",
      "data-principal-cumulative-in-cents",
    );
    const yearTenPrincipal = attributeValueInCents(
      "projection-year-10-current-cumulative",
      "data-principal-cumulative-in-cents",
    );

    expect(yearFivePrincipal).toBeCloseTo(
      initialMortgageInCents -
        detailValueInCents(5, "mortgageBalanceInCents"),
      6,
    );
    expect(yearTenPrincipal).toBeCloseTo(
      initialMortgageInCents -
        detailValueInCents(10, "mortgageBalanceInCents"),
      6,
    );
    expect(yearTenPrincipal).toBeGreaterThan(yearFivePrincipal);
    expect(yearTenPrincipal).toBeLessThanOrEqual(initialMortgageInCents);
    expect(
      attributeValueInCents(
        "projection-year-10-potential-cumulative",
        "data-principal-cumulative-in-cents",
      ),
    ).toBeCloseTo(yearTenPrincipal, 8);
    expect(valueInCents("projection-year-10-current-cumulative")).toBeCloseTo(
      attributeValueInCents(
        "projection-year-10-current-cumulative",
        "data-cashflow-cumulative-in-cents",
      ) + yearTenPrincipal,
      8,
    );
  });

  it("ramène le capital cumulé à zéro lorsque la mise de fonds couvre tout le prix", async () => {
    const user = await renderValidAnalysis();

    await replaceInputById(user, "down-payment", 500_000);

    await waitFor(() => {
      expect(
        attributeValueInCents(
          "projection-year-1-current-cumulative",
          "data-principal-cumulative-in-cents",
        ),
      ).toBe(0);
    });
    expect(valueInCents("projection-year-1-current-cumulative")).toBeCloseTo(
      attributeValueInCents(
        "projection-year-1-current-cumulative",
        "data-cashflow-cumulative-in-cents",
      ),
      8,
    );
  });

  it("dérive toujours l'écart du potentiel moins l'actuel", async () => {
    await renderValidAnalysis();

    const current = valueInCents("projection-year-1-current-annual");
    const potential = valueInCents("projection-year-1-potential-annual");
    const gap = valueInCents("projection-year-1-gap");

    expect(gap).toBeCloseTo(potential - current, 10);
  });

  it("met à jour les cumuls après chaque modification des loyers", async () => {
    const user = await renderValidAnalysis();
    const initialCurrent = valueInCents("projection-year-10-current-cumulative");
    const initialPotential = valueInCents(
      "projection-year-10-potential-cumulative",
    );

    await replaceInputById(user, "rent-current-unit-1", 2_200);
    await waitFor(() => {
      expect(valueInCents("projection-year-10-current-cumulative")).not.toBe(
        initialCurrent,
      );
    });
    expect(valueInCents("projection-year-10-potential-cumulative")).toBe(
      initialPotential,
    );

    const updatedCurrent = valueInCents(
      "projection-year-10-current-cumulative",
    );
    await replaceInputById(user, "rent-potential-unit-1", 2_700);
    await waitFor(() => {
      expect(valueInCents("projection-year-10-potential-cumulative")).not.toBe(
        initialPotential,
      );
    });
    expect(valueInCents("projection-year-10-current-cumulative")).toBe(
      updatedCurrent,
    );
  });

  it("actualise le tableau sans bouton de recalcul ni rechargement", async () => {
    const user = await renderValidAnalysis();
    const firstYearRow = screen.getByTestId("projection-year-1");
    const initialCurrent = valueInCents("projection-year-1-current-annual");
    const initialPotential = valueInCents("projection-year-1-potential-annual");
    const otherIncome = screen.getByLabelText(
      /Autres revenus de/,
    ) as HTMLInputElement;

    expect(screen.queryByRole("button", { name: /recalculer/i })).toBeNull();
    expect(screen.getAllByTestId(/^projection-year-\d+$/)).toHaveLength(10);

    await replaceInput(user, otherIncome, 600);

    await waitFor(() => {
      expect(valueInCents("projection-year-1-current-annual")).not.toBe(
        initialCurrent,
      );
    });
    expect(screen.getByTestId("projection-year-1")).toBe(firstYearRow);
    expect(valueInCents("projection-year-1-potential-annual")).toBe(
      initialPotential,
    );
    expect(screen.queryByRole("button", { name: /recalculer/i })).toBeNull();
  });

  it("ajoute la prise de valeur uniquement au cumul potentiel affiché", async () => {
    const user = await renderValidAnalysis();
    await openYearOneDetails(user);

    const potentialAnnual = valueInCents("projection-year-1-potential-annual");
    const potentialMonthly = valueInCents("projection-year-1-potential-monthly");
    const currentCumulative = valueInCents("projection-year-1-current-cumulative");
    const annualGap = valueInCents("projection-year-1-gap");
    const rawPotentialCumulative = attributeValueInCents(
      "projection-year-1-potential-cumulative",
      "data-cashflow-cumulative-in-cents",
    );
    const potentialCumulative = valueInCents(
      "projection-year-1-potential-cumulative",
    );
    const cumulativePrincipal = attributeValueInCents(
      "projection-year-1-potential-cumulative",
      "data-principal-cumulative-in-cents",
    );
    const appreciation = valueInCents(
      "projection-year-1-potential-appreciation",
    );
    const currentRno = detailValueInCents(
      1,
      "netOperatingIncomeInCents",
      "current",
    );
    const potentialRno = detailValueInCents(
      1,
      "netOperatingIncomeInCents",
      "potential",
    );
    const mortgagePayment = detailValueInCents(
      1,
      "mortgagePaymentsInCents",
    );
    const currentDscr = screen.getByTestId("result-dscr").textContent;
    const potentialDscr = screen.getByTestId("potential-result-dscr").textContent;

    expect(potentialCumulative).toBeCloseTo(
      rawPotentialCumulative + cumulativePrincipal + appreciation,
      8,
    );
    expect(
      screen.getByTestId("projection-appreciation-disclaimer").textContent,
    ).toContain("plus-value estimée non encaissée");

    await user.click(inputById("appreciation-enabled"));

    await waitFor(() => {
      expect(valueInCents("projection-year-1-potential-cumulative")).toBeCloseTo(
        rawPotentialCumulative + cumulativePrincipal,
        8,
      );
    });

    expect(valueInCents("projection-year-1-potential-annual")).toBeCloseTo(
      potentialAnnual,
      8,
    );
    expect(valueInCents("projection-year-1-potential-monthly")).toBeCloseTo(
      potentialMonthly,
      8,
    );
    expect(valueInCents("projection-year-1-current-cumulative")).toBeCloseTo(
      currentCumulative,
      8,
    );
    expect(valueInCents("projection-year-1-gap")).toBeCloseTo(annualGap, 8);
    expect(detailValueInCents(1, "netOperatingIncomeInCents", "current")).toBe(
      currentRno,
    );
    expect(detailValueInCents(1, "netOperatingIncomeInCents", "potential")).toBe(
      potentialRno,
    );
    expect(detailValueInCents(1, "mortgagePaymentsInCents")).toBe(
      mortgagePayment,
    );
    expect(screen.getByTestId("result-dscr").textContent).toBe(currentDscr);
    expect(screen.getByTestId("potential-result-dscr").textContent).toBe(
      potentialDscr,
    );
    expect(
      screen.queryByTestId("projection-year-1-potential-appreciation"),
    ).toBeNull();
    expect(screen.queryByTestId("projection-appreciation-disclaimer")).toBeNull();

    await user.click(inputById("appreciation-enabled"));

    await waitFor(() => {
      expect(valueInCents("projection-year-1-potential-cumulative")).toBeCloseTo(
        potentialCumulative,
        8,
      );
    });
  });

  it("compose la valeur estimée sans compter plusieurs fois la prise de valeur", async () => {
    await renderValidAnalysis();

    const analyzedPriceInCents = 50_000_000;
    const yearOneEstimatedValue = detailValueInCents(
      1,
      "estimatedPropertyValueInCents",
    );
    const yearTwoEstimatedValue = detailValueInCents(
      2,
      "estimatedPropertyValueInCents",
    );
    const yearOneAppreciation = valueInCents(
      "projection-year-1-potential-appreciation",
    );
    const yearTwoAppreciation = valueInCents(
      "projection-year-2-potential-appreciation",
    );

    expect(yearOneEstimatedValue).toBeCloseTo(analyzedPriceInCents * 1.03, 6);
    expect(yearTwoEstimatedValue).toBeCloseTo(
      analyzedPriceInCents * Math.pow(1.03, 2),
      6,
    );
    expect(yearOneAppreciation).toBeCloseTo(
      yearOneEstimatedValue - analyzedPriceInCents,
      6,
    );
    expect(yearTwoAppreciation).toBeCloseTo(
      yearTwoEstimatedValue - analyzedPriceInCents,
      6,
    );
    expect(valueInCents("projection-year-2-potential-cumulative")).toBeCloseTo(
      attributeValueInCents(
        "projection-year-2-potential-cumulative",
        "data-cashflow-cumulative-in-cents",
      ) +
        attributeValueInCents(
          "projection-year-2-potential-cumulative",
          "data-principal-cumulative-in-cents",
        ) +
        yearTwoAppreciation,
      8,
    );
  });

  it("réagit au taux de prise de valeur sans modifier le cashflow ni l’écart annuels", async () => {
    const user = await renderValidAnalysis();
    const potentialAnnual = valueInCents("projection-year-2-potential-annual");
    const potentialMonthly = valueInCents("projection-year-2-potential-monthly");
    const currentCumulative = valueInCents("projection-year-2-current-cumulative");
    const annualGap = valueInCents("projection-year-2-gap");
    const rawPotentialCumulative = attributeValueInCents(
      "projection-year-2-potential-cumulative",
      "data-cashflow-cumulative-in-cents",
    );
    const cumulativePrincipal = attributeValueInCents(
      "projection-year-2-potential-cumulative",
      "data-principal-cumulative-in-cents",
    );
    const initialCombinedCumulative = valueInCents(
      "projection-year-2-potential-cumulative",
    );

    await replaceInputById(user, "annual-appreciation", 5);

    await waitFor(() => {
      expect(valueInCents("projection-year-2-potential-cumulative")).not.toBe(
        initialCombinedCumulative,
      );
    });
    expect(valueInCents("projection-year-2-potential-appreciation")).toBeCloseTo(
      50_000_000 * Math.pow(1.05, 2) - 50_000_000,
      6,
    );
    expect(valueInCents("projection-year-2-potential-annual")).toBeCloseTo(
      potentialAnnual,
      8,
    );
    expect(valueInCents("projection-year-2-potential-monthly")).toBeCloseTo(
      potentialMonthly,
      8,
    );
    expect(valueInCents("projection-year-2-current-cumulative")).toBeCloseTo(
      currentCumulative,
      8,
    );
    expect(valueInCents("projection-year-2-gap")).toBeCloseTo(annualGap, 8);

    await replaceInputById(user, "annual-appreciation", 0);

    await waitFor(() => {
      expect(valueInCents("projection-year-2-potential-cumulative")).toBeCloseTo(
        rawPotentialCumulative + cumulativePrincipal,
        8,
      );
    });
    expect(valueInCents("projection-year-2-potential-appreciation")).toBe(0);
  });

  it("recalcule la valeur estimée et le cumul combiné lorsque le prix change", async () => {
    const user = await renderValidAnalysis();

    await replaceInputById(user, "analyzed-price", 675_000);

    await waitFor(() => {
      expect(detailValueInCents(1, "estimatedPropertyValueInCents")).toBeCloseTo(
        69_525_000,
        6,
      );
    });

    const rawPotentialCumulative = attributeValueInCents(
      "projection-year-1-potential-cumulative",
      "data-cashflow-cumulative-in-cents",
    );
    const cumulativePrincipal = attributeValueInCents(
      "projection-year-1-potential-cumulative",
      "data-principal-cumulative-in-cents",
    );
    expect(valueInCents("projection-year-1-potential-appreciation")).toBeCloseTo(
      2_025_000,
      6,
    );
    expect(valueInCents("projection-year-1-potential-cumulative")).toBeCloseTo(
      rawPotentialCumulative + cumulativePrincipal + 2_025_000,
      8,
    );
  });

  it("met à jour le cumul combiné avec les loyers et les dépenses existants", async () => {
    const user = await renderValidAnalysis();
    const initialRawCumulative = attributeValueInCents(
      "projection-year-3-potential-cumulative",
      "data-cashflow-cumulative-in-cents",
    );
    const appreciation = valueInCents(
      "projection-year-3-potential-appreciation",
    );

    await replaceInputById(user, "rent-potential-unit-1", 3_000);

    await waitFor(() => {
      expect(
        attributeValueInCents(
          "projection-year-3-potential-cumulative",
          "data-cashflow-cumulative-in-cents",
        ),
      ).not.toBe(initialRawCumulative);
    });
    expect(valueInCents("projection-year-3-potential-cumulative")).toBeCloseTo(
      attributeValueInCents(
        "projection-year-3-potential-cumulative",
        "data-cashflow-cumulative-in-cents",
      ) +
        attributeValueInCents(
          "projection-year-3-potential-cumulative",
          "data-principal-cumulative-in-cents",
        ) +
        appreciation,
      8,
    );

    const cumulativeBeforeExpense = valueInCents(
      "projection-year-3-potential-cumulative",
    );
    await replaceInputById(user, "expense-insurance", 8_000);

    await waitFor(() => {
      expect(valueInCents("projection-year-3-potential-cumulative")).toBeLessThan(
        cumulativeBeforeExpense,
      );
    });
    expect(valueInCents("projection-year-3-potential-cumulative")).toBeCloseTo(
      attributeValueInCents(
        "projection-year-3-potential-cumulative",
        "data-cashflow-cumulative-in-cents",
      ) +
        attributeValueInCents(
          "projection-year-3-potential-cumulative",
          "data-principal-cumulative-in-cents",
        ) +
        valueInCents("projection-year-3-potential-appreciation"),
      8,
    );
  });

  it("affiche le scénario potentiel avec les loyers actuels lorsqu’aucun potentiel n’est saisi", async () => {
    const user = userEvent.setup();
    render(<ManualAnalysisApp />);
    await replaceInputById(user, "analyzed-price", 500_000);
    await replaceInputById(user, "rent-current-unit-1", 2_000);

    await waitFor(() => {
      expect(valueInCents("projection-year-1-potential-annual")).toBeCloseTo(
        valueInCents("projection-year-1-current-annual"),
        8,
      );
    });

    const currentCumulative = valueInCents("projection-year-1-current-cumulative");
    const currentCashFlowCumulative = attributeValueInCents(
      "projection-year-1-current-cumulative",
      "data-cashflow-cumulative-in-cents",
    );
    const appreciation = valueInCents(
      "projection-year-1-potential-appreciation",
    );
    expect(
      attributeValueInCents(
        "projection-year-1-potential-cumulative",
        "data-cashflow-cumulative-in-cents",
      ),
    ).toBeCloseTo(currentCashFlowCumulative, 8);
    expect(valueInCents("projection-year-1-potential-cumulative")).toBeCloseTo(
      currentCumulative + appreciation,
      8,
    );
    expect(screen.getByTestId("projection-potential-scope").textContent).toContain(
      "reprend les loyers actuels",
    );
    expect(screen.queryByTestId("projection-potential-missing")).toBeNull();
  });
});
