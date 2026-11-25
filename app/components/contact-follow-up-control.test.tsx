// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Contact } from "../data/contact-types";
import type { ContactFollowUpCompletion } from "../data/contact-follow-up-types";
const state = vi.hoisted(() => ({ complete: vi.fn(), retry: vi.fn() }));
vi.mock("../follow-up-context", () => ({ useFollowUps: () => ({ completeFollowUp: state.complete }) }));
vi.mock("../crm-data-context", () => ({ useCRMData: () => ({ retry: state.retry }) }));
import { ContactFollowUpControl } from "./contact-follow-up-control";
import { ClientHistory } from "./client-history";
const contact = { id: "contact", nextFollowUpDate: "2026-11-20" } as Contact;
const entry: ContactFollowUpCompletion = { id: "completion", contact_id: "contact", scheduled_for: "2026-11-20", completed_at: "2026-11-26T02:12:00Z", completed_by_member_id: "member", completed_by_broker: "maxime", reverted_at: null, reverted_by_member_id: null, reverted_by_broker: null, google_sync_status: "synced", google_sync_error: null };
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Live network prohibited"); })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = (history: ContactFollowUpCompletion[] = [], scheduled = true) => render(<ContactFollowUpControl contact={{ ...contact, nextFollowUpDate: scheduled ? contact.nextFollowUpDate : null }} history={history} historyError={null} onRefresh={vi.fn(async () => {})} onSchedule={vi.fn()} />);
it("requires server success and disables repeat clicks without requiring a note", async () => {
  let resolve!: (value: unknown) => void;
  state.complete.mockImplementation(() => new Promise(r => { resolve = r; }));
  mount(); const checkbox = screen.getByRole("checkbox", { name: "SUIVI EFFECTUÉ" });
  fireEvent.click(checkbox); fireEvent.click(checkbox);
  expect(state.complete).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("SUIVI ENREGISTRÉ ✓")).toBeNull();
  resolve({ calendarSync: { status: "synced" } });
  await waitFor(() => expect(screen.getByText("SUIVI ENREGISTRÉ ✓")).toBeTruthy());
});
it("SQL failure displays an error, never success", async () => {
  state.complete.mockRejectedValue(new Error("La relance a changé.")); mount();
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("changé"));
  expect(screen.queryByText("SUIVI ENREGISTRÉ ✓")).toBeNull();
});
it("reload renders persisted time and actor without creating another completion", () => {
  const view = mount([entry], false);
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByText(/25 novembre 2026 à 21/)).toBeTruthy();
  expect(screen.getByText("Par Maxime")).toBeTruthy();
  view.unmount(); mount([entry], false);
  expect(state.complete).not.toHaveBeenCalled();
});
it("undo requires explicit confirmation and warns that a new follow-up is preserved", () => {
  mount([entry]); fireEvent.click(screen.getByText("Annuler la confirmation"));
  expect(screen.getByText(/nouvelle relance restera inchangée/)).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Conserver la confirmation"));
  expect(fetch).not.toHaveBeenCalled();
});
it("Google failure has a dedicated retry while keeping completion visible", () => {
  mount([{ ...entry, google_sync_status: "error", google_sync_error: "Retrait à réessayer" }], false);
  expect(screen.getByText("✓ Dernier suivi effectué")).toBeTruthy();
  expect(screen.getByText("Réessayer le retrait Google")).toBeTruthy();
});
it("notes and completion/correction events stay distinct and chronological", () => {
  render(<ClientHistory notes={[{ id: "note", createdAt: "2026-11-26T03:00:00Z", createdBy: "France", content: "Note synthétique" } as any]} completions={[{ ...entry, reverted_at: "2026-11-26T04:00:00Z", reverted_by_broker: "sandrine" }]} onAdd={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} />);
  const rows = document.querySelectorAll(".note-history-row");
  expect(rows[0].textContent).toContain("CONFIRMATION ANNULÉE");
  expect(rows[1].textContent).toContain("Note synthétique");
  expect(rows[2].textContent).toContain("SUIVI EFFECTUÉ");
  expect(screen.getAllByTitle("Modifier")).toHaveLength(1);
});
