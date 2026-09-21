import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Listing } from "../data/listing-types";
import { emptyListingDraft } from "../lib/listings/editor";

const state = vi.hoisted(() => ({
  query: "", listings: [] as Listing[], values: [] as unknown[], index: 0,
  loading: false, error: null as string | null, broker: "maxime", push: vi.fn(), retry: vi.fn(), create: vi.fn(),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = state.index++; if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial; return [state.values[i], (next: unknown) => { state.values[i] = typeof next === "function" ? next(state.values[i]) : next; }]; },
  useEffect: () => undefined, useMemo: (fn: () => unknown) => fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }), useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("../broker-context", () => ({ useBroker: () => ({ selectedBroker: state.broker, workspaceUser: "immoplus", workingBroker: state.broker }) }));
vi.mock("../contacts-context", () => ({ useContacts: () => ({ contacts: [] }) }));
vi.mock("../listings-context", () => ({ useListings: () => ({ listings: state.listings, isLoading: state.loading, isSaving: false, error: state.error, retry: state.retry, createListing: state.create }) }));
vi.mock("../components/listing-editor-modal", () => ({ ListingEditorModal: () => null }));
vi.mock("../components/listing-overview", () => ({ ListingOverview: () => null }));
vi.mock("../components/listing-checklist-preview", () => ({ ListingChecklistPreview: () => null }));
vi.mock("../components/listing-media", () => ({ ListingMedia: () => null }));
import ListingsPage from "./page";
import { ListingEditorModal } from "../components/listing-editor-modal";

type Props = Record<string, any>;
function nodes(tree: ReactNode, predicate: (props: Props, type: unknown) => boolean) {
  const found: Props[] = [];
  function walk(node: ReactNode) { if (!isValidElement<Props>(node)) return; if (predicate(node.props, node.type)) found.push(node.props); Children.forEach(node.props.children, walk); }
  walk(tree); return found;
}
function render() { state.index = 0; return ListingsPage(); }
function button(tree: ReactNode, label: string) { return nodes(tree, (p, type) => type === "button" && renderToStaticMarkup(p.children).replace(/<[^>]*>/g, "").startsWith(label))[0]; }
function listing(id: string, overrides: Partial<Listing> = {}): Listing {
  return { ...emptyListingDraft("maxime"), id, civicNumber: "100", address: `avenue Exemple ${id}`, status: "active", askingPrice: 450000, centrisNumber: "12345678", soldPrice: null, notaryDate: null, collaboratingBrokerName: "", createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides };
}
beforeEach(() => { vi.clearAllMocks(); Object.assign(state, { query: "", listings: [], values: [], index: 0, loading: false, error: null, broker: "maxime" }); vi.stubGlobal("window", { sessionStorage: { setItem: vi.fn() } }); state.create.mockResolvedValue(listing("new")); });

describe("Listings premium preserves inventory workflows", () => {
  it("shows the real address, Centris, price and status", () => {
    state.listings = [listing("A")]; const html = renderToStaticMarkup(render());
    for (const text of ["100 avenue Exemple A", "12345678", "450", "Actif", "Maxime"]) expect(html).toContain(text);
  });
  it("keeps address and Ouvrir navigation with the original history marker", () => {
    state.listings = [listing("A")]; const tree = render(); button(tree, "100 avenue Exemple A").onClick(); button(tree, "Ouvrir").onClick();
    expect(state.push.mock.calls).toEqual([["/listings/A"], ["/listings/A"]]); expect(window.sessionStorage.setItem).toHaveBeenCalledWith("listingOriginId", "A");
  });
  it.each(["france", "maxime", "sandrine"])("preserves the Immoplus working broker %s", broker => {
    state.broker = broker; state.listings = [listing("A", { broker: "france" }), listing("B"), listing("C", { broker: "sandrine" })];
    expect(nodes(render(), p => p.className === "listing-card")).toHaveLength(1);
  });
  it("preserves explicit broker and rental URL filters", () => {
    state.query = "broker=france&purpose=rental"; state.listings = [listing("A", { broker: "france", purpose: "rental", monthlyRent: 1800 }), listing("B")];
    const html = renderToStaticMarkup(render()); expect(html).toContain("avenue Exemple A"); expect(html).not.toContain("avenue Exemple B"); expect(html).toContain("mois");
  });
  it("retains filter navigation without discarding the other URL parameters", () => {
    state.query = "purpose=rental"; button(render(), "France").onClick(); expect(state.push).toHaveBeenCalledWith("/listings?purpose=rental&broker=france");
  });
  it("retains Centris search and empty results", () => {
    state.listings = [listing("A")]; nodes(render(), p => p.type === "search")[0].onChange({ target: { value: "87654321" } });
    expect(renderToStaticMarkup(render())).toContain("AUCUN LISTING TROUVÉ");
  });
  it("opens the unchanged edit form with the actual listing draft", () => {
    state.listings = [listing("A")]; button(render(), "Modifier").onClick(); const modal = nodes(render(), (_, type) => type === ListingEditorModal)[0];
    expect(modal.mode).toBe("edit"); expect(modal.initial.address).toBe("avenue Exemple A"); expect(modal.initial.askingPrice).toBe(450000);
  });
  it("creates through the same context callback with the selected broker", async () => {
    state.broker = "sandrine"; button(render(), "+ Nouveau Listing").onClick(); const modal = nodes(render(), (_, type) => type === ListingEditorModal)[0];
    expect(modal.initial.broker).toBe("sandrine"); await modal.onSave(modal.initial); expect(state.create).toHaveBeenCalledWith(modal.initial);
  });
  it("retains loading and retry without fabricated inventory", () => {
    state.loading = true; expect(renderToStaticMarkup(render())).toContain("Chargement de l’inventaire");
    state.loading = false; state.error = "offline"; button(render(), "Réessayer").onClick(); expect(state.retry).toHaveBeenCalled(); expect(nodes(render(), p => p.className === "listing-card")).toHaveLength(0);
  });
});
