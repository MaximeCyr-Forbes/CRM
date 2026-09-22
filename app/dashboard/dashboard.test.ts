import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Contact } from "../data/contact-types";
import type { Transaction } from "../data/transaction-types";
import { toLocalISODate } from "../lib/follow-up";

const state = vi.hoisted(() => ({
  broker: "Maxime", user: "maxime", contacts: [] as Contact[], transactions: [] as Transaction[],
  contactsLoading: false, contactsError: null as string | null, transactionsLoading: false, transactionsError: null as string | null,
  index: 0, values: [] as unknown[], effects: [] as Array<() => unknown>, refs: [] as Array<{ current: unknown }>, refIndex: 0,
  push: vi.fn(), replace: vi.fn(), complete: vi.fn(), request: vi.fn(),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = state.index++; if (!(i in state.values)) state.values[i] = initial; return [state.values[i], (value: unknown) => { state.values[i] = typeof value === "function" ? value(state.values[i]) : value; }]; },
  useRef: (initial: unknown) => { const i = state.refIndex++; return state.refs[i] ??= { current: initial }; },
  useEffect: (effect: () => unknown) => { state.effects.push(effect); }, useMemo: (fn: () => unknown) => fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, replace: state.replace }) }));
vi.mock("../broker-context", () => ({ useBroker: () => ({ selectedBroker: state.broker, workspaceUser: state.user, isBrokerReady: true, capabilities: { administerRecommendations: state.user === "maxime" } }) }));
vi.mock("../contacts-context", () => ({ useContacts: () => ({ contacts: state.contacts }) }));
vi.mock("../crm-data-context", () => ({ useCRMData: () => ({ isLoading: state.contactsLoading, error: state.contactsError }) }));
vi.mock("../transactions-context", () => ({ useTransactions: () => ({ transactions: state.transactions, isLoading: state.transactionsLoading, error: state.transactionsError }) }));
vi.mock("../listings-context", () => ({ useListings: () => ({ listings: [], isLoading: false, error: null }) }));
vi.mock("../follow-up-context", () => ({ useFollowUps: () => ({ completeFollowUp: state.complete }) }));
vi.mock("../lib/workspace-request", () => ({ workspaceRequest: state.request }));
vi.mock("../components/data-status", () => ({ DataStatus: () => null }));
import Dashboard from "./page";
import { DashboardActions, DashboardTransactions } from "./dashboard-panels";
import { DailyNotificationsPanel } from "../components/daily-notifications-panel";

const today = () => toLocalISODate(new Date());
function contact(id: string, broker: Contact["broker"] = "maxime", date: string | null = today()): Contact {
  return { id, broker, firstName: "Camille", lastName: id, nextFollowUpDate: date, clientType: "buyer", status: "active", phone: "555-0100", priority: "hot", birthDate: "", mortgageRenewalDate: "", addresses: [], email: "", civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "", clientProvenance: null, source: "manual", lastContactDate: null, googleCalendarEventId: null, googleCalendarEventBroker: null, googleCalendarSyncStatus: "synced", googleCalendarLastError: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
}
function transaction(id: string, broker = "maxime", status = "financing"): Transaction {
  return { id, broker, address: "100 avenue Exemple, Ville Démonstration", type: "purchase", status, saleFinalizedAt: null, purchaseFinalizedAt: null, contactIds: [], price: 420000, deadlines: [], notes: [] } as unknown as Transaction;
}
function render() { state.index = 0; state.refIndex = 0; state.effects = []; return Dashboard(); }
function nodes(tree: ReactNode, predicate: (p: Record<string, unknown>, type: unknown) => boolean) {
  const result: Array<Record<string, unknown>> = [];
  function walk(node: ReactNode) { if (!isValidElement<Record<string, unknown>>(node)) return; if (predicate(node.props, node.type)) result.push(node.props); Children.forEach(node.props.children as ReactNode, walk); }
  walk(tree); return result;
}
function doneButton(tree: ReactNode) { return nodes(tree, p => p.className === "complete-follow-up")[0]; }
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(state, { broker: "Maxime", user: "maxime", contacts: [], transactions: [], contactsLoading: false, contactsError: null, transactionsLoading: false, transactionsError: null, index: 0, values: [], refs: [], refIndex: 0, effects: [] });
  state.complete.mockResolvedValue({ calendarSync: { status: "synced" } });
  state.request.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
});
describe("dashboard presentation preserves existing data and actions", () => {
  it.each(["France", "Maxime", "Sandrine"])("greets the real broker %s", broker => {
    state.broker = broker; state.user = broker.toLowerCase(); expect(renderToStaticMarkup(render())).toContain(`Bonjour ${broker}`);
  });
  it("greets Immoplus while showing only working-broker transactions", () => {
    state.user = "immoplus"; state.transactions = [transaction("max"), transaction("other", "france")];
    const html = renderToStaticMarkup(render()); expect(html).toContain("Bonjour Immoplus"); expect(html).toContain("Courtier de travail"); expect(html).not.toContain("Bonjour Maxime");
    const panel = nodes(render(), (_, type) => type === DashboardTransactions)[0];
    expect((panel.transactions as Transaction[]).map(t => t.id)).toEqual(["max"]);
  });
  it("keeps original KPI values, filtering, and destinations", () => {
    state.contacts = [contact("due"), contact("late", "maxime", "2001-01-01"), contact("other", "france")];
    state.transactions = [transaction("active"), transaction("completed", "maxime", "completed"), transaction("cancelled", "maxime", "cancelled"), transaction("other", "france")];
    const cards = nodes(render(), p => String(p.className).startsWith("metric-card "));
    const html = cards.map(p => renderToStaticMarkup(p.children as ReactNode));
    expect(html[0]).toContain('class="metric-value">1<'); expect(html[2]).toContain('class="metric-value">1<'); expect(html[3]).toContain('class="metric-value">1<'); expect(html[4]).toContain('class="metric-value">2<');
    cards.forEach(p => (p.onClick as () => void)());
    expect(state.push.mock.calls.map(args => args[0])).toEqual(["/transactions?broker=maxime", "/listings?broker=maxime&status=active", "/contacts/due?mode=followups", "/contacts/late?mode=followups", "/contacts"]);
  });
  it("shows no temporary zero for loading contacts and transactions", () => {
    state.contactsLoading = true; state.transactionsLoading = true;
    const cards = nodes(render(), p => String(p.className).startsWith("metric-card "));
    for (const i of [0, 2, 3, 4]) expect(renderToStaticMarkup(cards[i].children as ReactNode)).toContain('class="metric-value">—<');
  });
  it("shows errors and avoids false empty states", () => {
    state.contactsError = "Erreur contacts"; state.transactionsError = "Erreur transactions";
    const html = renderToStaticMarkup(render()); expect(html).toContain("Erreur contacts"); expect(html).toContain("Erreur transactions"); expect(html).not.toContain("Aucune transaction en cours");
  });
  it("opens follow-up details and starts the existing queue", () => {
    state.contacts = [contact("due")]; const tree = render();
    (nodes(tree, p => p.className === "open-client")[0].onClick as () => void)();
    (nodes(tree, p => p.className === "start-follow-ups start-follow-ups-button")[0].onClick as () => void)();
    expect(state.push.mock.calls).toEqual([["/contacts/due"], ["/contacts/due?mode=followups"]]);
  });
  it("completes only the clicked follow-up and prevents double submission", async () => {
    state.contacts = [contact("due")]; const button = doneButton(render());
    (button.onClick as () => void)(); (button.onClick as () => void)();
    expect(state.complete).toHaveBeenCalledExactlyOnceWith("due");
    await vi.waitFor(() => expect(state.values[1]).toEqual({ tone: "success", message: "Relance de Camille due terminée." }));
  });
  it("retains the Google cleanup retry warning", async () => {
    state.contacts = [contact("due")]; state.complete.mockResolvedValue({ calendarSync: { status: "error" } });
    (doneButton(render()).onClick as () => void)();
    await vi.waitFor(() => expect(state.values[1]).toEqual({ tone: "error", message: "Relance retirée du CRM · suppression Google Agenda à resynchroniser." }));
  });
  it("retains CRM failure feedback and allows retry", async () => {
    state.contacts = [contact("due")]; state.complete.mockRejectedValue(new Error("failed"));
    (doneButton(render()).onClick as () => void)();
    await vi.waitFor(() => expect((state.values[1] as {message: string}).message).toContain("Impossible de terminer"));
    expect(doneButton(render()).disabled).toBe(false);
  });
  it.each(["france", "sandrine", "immoplus"])("does not request recommendations for %s", user => {
    state.user = user; render(); state.effects[2](); expect(state.request).not.toHaveBeenCalled();
  });
  it("keeps the Maxime recommendations request and deep-link navigation", () => {
    render(); state.effects[2](); expect(state.request).toHaveBeenCalledWith("/api/recommendations", { cache: "no-store" });
    const panel = nodes(render(), (_, type) => type === DailyNotificationsPanel)[0];
    (panel.onNavigate as (href: string) => void)("/settings?recommendation=example"); expect(state.push).toHaveBeenCalledWith("/settings?recommendation=example");
  });
  it("never retains the previous broker in derived dashboard rows", () => {
    state.transactions = [transaction("max"), transaction("france", "france"), transaction("sandrine", "sandrine")]; state.user = "immoplus";
    for (const broker of ["Maxime", "France", "Sandrine"]) { state.broker = broker; expect((nodes(render(), (_, type) => type === DashboardTransactions)[0].transactions as Transaction[]).map(t => t.id)).toEqual([broker === "Maxime" ? "max" : broker.toLowerCase()]); }
  });
  it("limits transaction rows and reuses status labels, real price, contacts and next deadline", () => {
    const t = transaction("example"); t.contactIds = ["person"]; t.deadlines = [{ id: "d", title: "Inspection", dueDate: "2026-10-10", dueTime: "13:30", completed: false }] as Transaction["deadlines"];
    const navigate = vi.fn(); const tree = DashboardTransactions({ transactions: [t, ...Array.from({length: 5}, (_, i) => transaction(`extra-${i}`))], contacts: [contact("person")], loading: false, error: null, onNavigate: navigate });
    const html = renderToStaticMarkup(tree); expect(html).toContain("Financement"); expect(html).toContain("Camille person"); expect(html).toContain("Inspection"); expect(html).toContain("13 h 30"); expect(html).not.toContain("<img");
    const rows = nodes(tree, p => p.className === "dash-transaction"); expect(rows).toHaveLength(4); (rows[0].onClick as () => void)(); expect(navigate).toHaveBeenCalledWith("/transactions/example");
  });
  it("uses the existing next deadline and follow-up destinations for actions", () => {
    const t = transaction("example"); t.deadlines = [{ id: "d", title: "Inspection", dueDate: "2026-10-10", dueTime: null, completed: false }] as Transaction["deadlines"];
    const navigate = vi.fn(); const tree = DashboardActions({ queue: [contact("due")], transactions: [t], loading: false, unavailable: false, today: today(), onNavigate: navigate });
    nodes(tree, p => p.className === "dash-action").forEach(p => (p.onClick as () => void)());
    expect(state.request).not.toHaveBeenCalled(); expect(navigate.mock.calls.map(args => args[0])).toEqual(expect.arrayContaining(["/contacts/due?mode=followups", "/transactions/example"]));
  });
});
