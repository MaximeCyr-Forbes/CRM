// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import InteractiveTrends from "./interactive-trends";
import { calculateStatistics, resolveStatisticsRange } from "../lib/statistics/calculations";
import type { StatisticsDrilldown } from "../lib/statistics/drilldown";

const range = resolveStatisticsRange({ year: 2026, period: "custom", from: "2026-11-03", to: "2026-11-10", now: "2026-11-27" })!;
const snapshot = calculateStatistics({ contacts: [], listings: [], transactions: [], offers: [], listingTransactionLinks: [], transactionContacts: [] }, range, "team", "2026-11-27", 2026);
const query = "/api/statistics?year=2026&period=custom&broker=team&from=2026-11-03&to=2026-11-10";
const response = (extra: Partial<StatisticsDrilldown> = {}) => ({ ok: true, json: async () => ({ data: { metric: "sales", month: "2026-11", broker: "team", range, page: 1, pageSize: 25, count: 0, total: 0, saleVolume: 0, purchaseVolume: 0, revision: "a".repeat(64), rows: [], ...extra } }) });
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("ne charge aucun détail au montage; six boutons accessibles avec valeurs et dates exactes", async () => {
  render(<InteractiveTrends snapshot={snapshot} query={query} />);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button")).toHaveLength(6);
  const trigger = screen.getByRole("button", { name: /novembre 2026 — Transactions de vente : 0.*2026-11-03.*2026-11-10/ });
  trigger.focus(); fireEvent.click(trigger);
  await screen.findByText("Aucun dossier pour cette période.");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("metric=sales");
  expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("from=2026-11-03");
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it.each(["Nouveaux Listings", "Transactions de vente", "Transactions d’achat", "Volume de vente", "Volume d’achat", "Volume total"])("ouvre la série %s sans écriture", async (label) => {
  render(<InteractiveTrends snapshot={snapshot} query={query} />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`novembre 2026 — ${label}`) }));
  await screen.findByText("Aucun dossier pour cette période.");
  expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined();
});

it.each([401, 403, 400, 500])("affiche l'erreur HTTP %i sans prétendre que le résultat est vide", async (status) => {
  vi.mocked(fetch).mockResolvedValue({ ok: false, status, json: async () => ({ error: `Erreur ${status}` }) } as Response);
  render(<InteractiveTrends snapshot={snapshot} query={query} />);
  fireEvent.click(screen.getByRole("button", { name: /Transactions de vente/ }));
  await screen.findByText(`Erreur ${status}`);
  expect(screen.queryByText("Aucun dossier pour cette période.")).toBeNull();
});

it("ignore la réponse tardive après fermeture et changement de filtre", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const view = render(<InteractiveTrends key="team" snapshot={snapshot} query={query} />);
  fireEvent.click(screen.getByRole("button", { name: /Transactions de vente/ }));
  const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
  view.rerender(<InteractiveTrends key="france" snapshot={{ ...snapshot, broker: "france" }} query={query.replace("team", "france")} />);
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve(response({ count: 99 }) as Response));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Transactions d’achat/ }));
  await screen.findByText("Aucun dossier pour cette période.");
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("broker=france");
});

it("conserve les totaux sur plusieurs pages et les liens exacts; avertit lors d'un changement", async () => {
  const row = { id: "11111111-1111-4111-8111-111111111111", kind: "sale" as const, date: "2026-11-05", broker: "france", amount: 123456.78, status: "completed", address: "Adresse synthétique" };
  vi.mocked(fetch).mockResolvedValue(response({ count: 26, total: 123456.78, rows: [row] }) as Response);
  render(<InteractiveTrends snapshot={snapshot} query={query} />);
  fireEvent.click(screen.getByRole("button", { name: /Transactions de vente/ }));
  await screen.findByText("Adresse synthétique");
  expect(screen.getByRole("link").getAttribute("href")).toBe(`/transactions/${row.id}`);
  expect(screen.getByRole("link").getAttribute("target")).toBe("_blank");
  expect(screen.getByText(/Données mises à jour/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain("page=2");
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain(`revision=${"a".repeat(64)}`);
});

it("interrompt le chargement après quinze secondes", async () => {
  vi.useFakeTimers();
  vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
  render(<InteractiveTrends snapshot={snapshot} query={query} />);
  fireEvent.click(screen.getByRole("button", { name: /Transactions de vente/ }));
  await act(async () => vi.advanceTimersByTime(15000));
  expect(screen.getByRole("alert").textContent).toContain("trop de temps");
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
});
