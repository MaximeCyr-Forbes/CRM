import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction, TransactionDeadline, TransactionDraft } from "../data/transaction-types";

const state = vi.hoisted(() => ({
  broker: "Maxime", query: "", transactions: [] as Transaction[], loading: false, error: null as string | null,
  values: [] as unknown[], index: 0, refs: [] as Array<{current: unknown}>, refIndex: 0,
  push: vi.fn(), create: vi.fn(), retry: vi.fn(),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = state.index++; if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial; return [state.values[i], (value: unknown) => { state.values[i] = typeof value === "function" ? value(state.values[i]) : value; }]; },
  useRef: (initial: unknown) => state.refs[state.refIndex++] ??= { current: initial },
  useEffect: () => undefined, useMemo: (fn: () => unknown) => fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }), useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("../broker-context", () => ({ useBroker: () => ({ selectedBroker: state.broker, workspaceUser: "immoplus" }) }));
vi.mock("../contacts-context", () => ({ useContacts: () => ({ contacts: [] }) }));
vi.mock("../transactions-context", () => ({ useTransactions: () => ({ transactions: state.transactions, isLoading: state.loading, isSaving: false, error: state.error, retry: state.retry, createTransaction: state.create }) }));
vi.mock("../components/transaction-editor-modal", () => ({ TransactionEditorModal: () => null }));
import TransactionsPage from "./page";
import { TransactionEditorModal } from "../components/transaction-editor-modal";
import { TransactionAgenda } from "../components/transaction-agenda";

type Props = Record<string, any>;
function nodes(tree: ReactNode, predicate: (props: Props, type: unknown) => boolean) {
  const result: Props[] = [];
  function walk(node: ReactNode) { if (!isValidElement<Props>(node)) return; if (predicate(node.props, node.type)) result.push(node.props); Children.forEach(node.props.children, walk); }
  walk(tree); return result;
}
function render() { state.index = 0; state.refIndex = 0; return TransactionsPage(); }
function button(tree: ReactNode, label: string) { return nodes(tree, (p, type) => type === "button" && renderToStaticMarkup(p.children).replace(/<[^>]*>/g, "").startsWith(label))[0]; }
function transaction(id: string, overrides: Partial<Transaction> = {}): Transaction {
  return { id, address: `100 avenue Exemple ${id}`, broker: "maxime", type: "purchase", status: "new", contactIds: [], price: 420000, soldPrice: null, centrisNumber: "12345678", notaryDate: null, promiseDate: null, saleFinalizedAt: null, purchaseFinalizedAt: null, deadlines: [], notes: [], generalNotes: "", createdAt: "2026-01-01", updatedAt: "2026-01-01", sourceListing: null, collaboratingBrokerName: "", ...overrides } as Transaction;
}
beforeEach(() => { vi.clearAllMocks(); Object.assign(state, { broker: "Maxime", query: "", transactions: [], loading: false, error: null, values: [], index: 0, refs: [], refIndex: 0 }); state.create.mockResolvedValue(undefined); });

describe("Transactions premium keeps the existing routes, data, and filters", () => {
  it("renders actual data in a table, with no fabricated property image", () => {
    state.transactions = [transaction("A")]; const html = renderToStaticMarkup(render());
    expect(html).toContain("<table"); expect(html).toContain("100 avenue Exemple A"); expect(html).toContain("420"); expect(html).toContain("Aucun contact lié"); expect(html).not.toContain("<img");
  });
  it("opens the same transaction from its address and its existing Ouvrir action", () => {
    state.transactions = [transaction("A")]; const tree = render(); button(tree, "100 avenue Exemple A").onClick(); button(tree, "Ouvrir").onClick();
    expect(state.push.mock.calls).toEqual([["/transactions/A"], ["/transactions/A"]]);
  });
  it.each(["France", "Maxime", "Sandrine"])("uses working broker %s", broker => {
    state.broker = broker; state.transactions = [transaction("A", { broker: "france" }), transaction("B", { broker: "maxime" }), transaction("C", { broker: "sandrine" })];
    expect(nodes(render(), (_, type) => type === "tbody")[0].children.filter(Boolean)).toHaveLength(1);
    expect(renderToStaticMarkup(render())).toContain(`Courtier · ${broker}`);
  });
  it("retains the explicit URL broker filter", () => {
    state.query = "broker=france"; state.transactions = [transaction("France", { broker: "france" }), transaction("Maxime")];
    const html = renderToStaticMarkup(render()); expect(html).toContain("100 avenue Exemple France"); expect(html).not.toContain("100 avenue Exemple Maxime");
  });
  it("retains broker and type filter interactions", () => {
    state.transactions = [transaction("A"), transaction("B", { broker: "france", type: "sale" })];
    button(render(), "Tous").onClick(); button(render(), "Ventes").onClick();
    const html = renderToStaticMarkup(render()); expect(html).toContain("100 avenue Exemple B"); expect(html).not.toContain("100 avenue Exemple A");
  });
  it("retains search by Centris and the empty state", () => {
    state.transactions = [transaction("A")]; nodes(render(), p => p.type === "search")[0].onChange({ target: { value: "87654321" } });
    expect(renderToStaticMarkup(render())).toContain("Aucune transaction");
    nodes(render(), p => p.type === "search")[0].onChange({ target: { value: "12345678" } }); expect(renderToStaticMarkup(render())).toContain("100 avenue Exemple A");
  });
  it("retains sold-year filtering and the final sale price", () => {
    state.query = "state=sold&year=2026"; state.transactions = [transaction("Sold", { type: "sale", status: "completed", soldPrice: 480000, notaryDate: "2026-09-20", saleFinalizedAt: "2026-09-20T12:00:00Z" }), transaction("Old", { status: "completed", notaryDate: "2025-09-20", purchaseFinalizedAt: "2025-09-20T12:00:00Z" })];
    const html = renderToStaticMarkup(render()); expect(html).toContain("100 avenue Exemple Sold"); expect(html).not.toContain("100 avenue Exemple Old"); expect(html).toContain("480"); expect(html).toContain("Année des Transactions vendues");
  });
  it("keeps creation defaults, onSave payload and existing-record navigation", async () => {
    state.broker = "France"; button(render(), "+ Nouvelle transaction").onClick();
    const modal = nodes(render(), (_, type) => type === TransactionEditorModal)[0]; expect(modal.initial.broker).toBe("france");
    const draft = { ...modal.initial, address: "100 avenue Exemple", deadlines: [] } as TransactionDraft;
    await modal.onSave(draft); expect(state.create).toHaveBeenCalledExactlyOnceWith(draft);
    button(render(), "+ Nouvelle transaction").onClick(); nodes(render(), (_, type) => type === TransactionEditorModal)[0].onOpenExisting("existing"); expect(state.push).toHaveBeenCalledWith("/transactions/existing");
  });
  it("keeps loading and error recovery visible", () => {
    state.loading = true; state.error = "Erreur contrôlée"; const tree = render(); const html = renderToStaticMarkup(tree); expect(html).toContain("Chargement des transactions"); expect(html).toContain("Erreur contrôlée"); button(tree, "Réessayer").onClick(); expect(state.retry).toHaveBeenCalledOnce();
  });
});

describe("premium timeline preserves deadline actions", () => {
  function agenda(completed = false) {
    state.index = 0; state.refIndex = 0;
    const deadline = { id: "d1", title: "Inspection", dueDate: "2026-09-25", dueTime: "10:30", completed, googleCalendarEventId: "existing", googleCalendarSyncStatus: "synced", source: { type: "oaciq", form: "PA", section: "8.1", document: "Synthétique.pdf", confidence: "high", text: "Condition synthétique" } } as TransactionDeadline;
    const callbacks = { onAdd: vi.fn(), onEdit: vi.fn(), onComplete: vi.fn().mockResolvedValue({}), onDelete: vi.fn().mockResolvedValue({}), onSync: vi.fn().mockResolvedValue({}) };
    return { deadline, callbacks, tree: TransactionAgenda({ deadlines: [deadline], disabled: false, ...callbacks }) };
  }
  it("shows date, time, Google status and source without changing the deadline", () => {
    const { tree } = agenda(); const html = renderToStaticMarkup(tree); expect(nodes(tree, (_, type) => type === "time")[0].dateTime).toBe("2026-09-25"); expect(html).toContain("10 h 30"); expect(html).toContain("Synchronisé"); expect(html).toContain("clause 8.1"); expect(html).toContain("Condition synthétique");
  });
  it("keeps add/edit/sync callbacks", () => {
    const { tree, callbacks, deadline } = agenda(); button(tree, "+ Ajouter").onClick(); button(tree, "Modifier").onClick(); button(tree, "Synchroniser").onClick(); expect(callbacks.onAdd).toHaveBeenCalledOnce(); expect(callbacks.onEdit).toHaveBeenCalledWith(deadline); expect(callbacks.onSync).toHaveBeenCalledOnce();
  });
  it("keeps Fait and retains completed entries", () => {
    const { tree, callbacks, deadline } = agenda(); nodes(tree, p => p.type === "checkbox")[0].onChange({ target: { checked: true } }); expect(callbacks.onComplete).toHaveBeenCalledWith(deadline, true);
    state.values = []; expect(renderToStaticMarkup(agenda(true).tree)).toContain("Inspection"); expect(renderToStaticMarkup(agenda(true).tree)).toContain("FAIT");
  });
  it("keeps delete confirmation and its existing callback", () => {
    vi.stubGlobal("window", { confirm: vi.fn().mockReturnValue(true) }); const { tree, callbacks, deadline } = agenda(); button(tree, "Supprimer").onClick(); expect(callbacks.onDelete).toHaveBeenCalledWith(deadline); vi.unstubAllGlobals();
  });
});
