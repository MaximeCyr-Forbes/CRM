import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "../data/contact-types";

const state = vi.hoisted(() => ({
  query: "", contacts: [] as Contact[], values: [] as unknown[], index: 0, effects: [] as Array<() => void>,
  workspace: "maxime", broker: "maxime", push: vi.fn(), replace: vi.fn(),
  create: vi.fn(), importContacts: vi.fn(), merge: vi.fn(), enrich: vi.fn(), assign: vi.fn(), remove: vi.fn(),
}));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState: (initial: unknown) => { const i = state.index++; if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial; return [state.values[i], (next: unknown) => { state.values[i] = typeof next === "function" ? next(state.values[i]) : next; }]; },
  useRef: (value: unknown) => ({ current: value }), useEffect: (fn: () => void) => { state.effects.push(fn); }, useMemo: (fn: () => unknown) => fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, replace: state.replace }), useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("../broker-context", () => ({ useBroker: () => ({ selectedBroker: "Maxime", workspaceUser: state.workspace, workingBroker: state.broker }) }));
vi.mock("../contacts-context", () => ({ useContacts: () => ({ contacts: state.contacts, addManualContact: state.create, importContacts: state.importContacts, enrichContactBirthDates: state.enrich, assignContact: state.assign, deleteContact: state.remove, mergeDraftIntoContact: state.merge }) }));
vi.mock("../crm-data-context", () => ({ useCRMData: () => ({ notes: [], loadNotesForContact: vi.fn(), isLoading: false, isSaving: false }) }));
vi.mock("../components/data-status", () => ({ DataStatus: () => null }));
vi.mock("../components/contact-email-modal", () => ({ ContactEmailModal: () => null }));
vi.mock("../components/contact-bulk-delete-modal", () => ({ ContactBulkDeleteModal: () => null }));
vi.mock("../components/duplicate-resolution-modal", () => ({ DuplicateResolutionModal: () => null }));
vi.mock("../components/import-contact-review-modal", () => ({ ImportContactReviewModal: () => null }));
import ContactsPage from "./page";
import { ContactEmailModal } from "../components/contact-email-modal";
import { ContactBulkDeleteModal } from "../components/contact-bulk-delete-modal";
import { DuplicateResolutionModal } from "../components/duplicate-resolution-modal";

type Props = Record<string, any>;
function nodes(tree: ReactNode, predicate: (props: Props, type: unknown) => boolean) {
  const found: Props[] = [];
  function walk(node: ReactNode) { if (!isValidElement<Props>(node)) return; if (predicate(node.props, node.type)) found.push(node.props); Children.forEach(node.props.children, walk); }
  Children.forEach(tree, walk); return found;
}
function render() { state.index = 0; state.effects = []; return ContactsPage(); }
function button(tree: ReactNode, name: string) { return nodes(tree, (p, t) => t === "button" && renderToStaticMarkup(p.children).replace(/<[^>]*>/g, "").startsWith(name))[0]; }
function contact(id: string, overrides: Partial<Contact> = {}): Contact {
  return { id, firstName: "Camille", lastName: `Exemple ${id}`, phone: "5145550100", email: `${id}@example.test`, birthDate: "", mortgageRenewalDate: "", civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "", broker: "maxime", clientType: "buyer", clientProvenance: null, priority: "warm", status: "active", source: "manual", lastContactDate: null, nextFollowUpDate: null, googleCalendarEventId: null, googleCalendarEventBroker: null, googleCalendarSyncStatus: "synced", googleCalendarLastError: null, addresses: [], createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides };
}
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(state, { query: "", contacts: [], values: [], index: 0, workspace: "maxime", broker: "maxime" });
  vi.stubGlobal("window", { history: { state: {}, replaceState: vi.fn() }, location: { search: "", hash: "" }, setTimeout: vi.fn() });
  state.create.mockResolvedValue(contact("created")); state.importContacts.mockResolvedValue([contact("imported")]); state.merge.mockResolvedValue(contact("merged"));
});

describe("Contacts premium retains existing workflows", () => {
  it("does not replace a restored page with stale profile params during Browser Back", () => {
    state.contacts = Array.from({ length: 151 }, (_, i) => contact(String(i)));
    state.query = "returnTo=%2Fcontacts%3Fpage%3D3";
    window.location.search = "?page=3";
    render(); state.effects.forEach(effect => effect());
    expect(state.replace).not.toHaveBeenCalled();
    state.query = "page=3"; const tree = render(); state.effects.forEach(effect => effect());
    expect(state.replace).not.toHaveBeenCalled();
    expect(nodes(tree, p => p.id === "contact-100")).toHaveLength(1);
  });
  it("still normalizes an out-of-range page once URL and router agree", () => {
    state.contacts = [contact("A")]; state.query = "page=99"; window.location.search = "?page=99";
    render(); state.effects.forEach(effect => effect());
    expect(state.replace).toHaveBeenCalledWith("/contacts?page=1", { scroll: false });
  });
  it("renders only the requested page, with both navigation actions preserving returnTo", () => {
    state.contacts = Array.from({ length: 151 }, (_, i) => contact(String(i), { phone: "" })); state.query = "page=3&broker=maxime";
    let tree = render(); expect(nodes(tree, p => p.className?.startsWith("contact-row") && p.id)).toHaveLength(50);
    button(tree, "Camille Exemple 100").onClick(); button(tree, "Ouvrir").onClick();
    expect(state.push.mock.calls).toEqual(Array(2).fill(["/contacts/100?returnTo=%2Fcontacts%3Fpage%3D3%26broker%3Dmaxime%23contact-100"]));
    expect(window.history.replaceState).toHaveBeenCalledWith({}, "", "/contacts?page=3&broker=maxime#contact-100");
  });
  it("pushes page changes while retaining search and broker", () => {
    state.contacts = Array.from({ length: 110 }, (_, i) => contact(String(i))); state.query = "q=Camille&broker=maxime&page=2";
    button(render(), "SUIVANT").onClick(); expect(state.push).toHaveBeenCalledWith("/contacts?q=Camille&broker=maxime&page=3", { scroll: false });
  });
  it("keeps search and filters in the URL", () => {
    state.query = "broker=maxime&page=3"; nodes(render(), p => p.type === "search")[0].onChange({ target: { value: "Tremblay" } });
    expect(state.replace).toHaveBeenCalledWith("/contacts?broker=maxime&page=1&q=Tremblay", { scroll: false });
    state.query = "q=Tremblay&page=2"; button(render(), "France").onClick(); expect(state.replace).toHaveBeenLastCalledWith("/contacts?q=Tremblay&page=1&broker=france", { scroll: false });
  });
  it.each(["maxime", "france"])("uses the Immoplus working broker %s unless explicitly filtered", broker => {
    state.workspace = "immoplus"; state.broker = broker; state.contacts = [contact("M"), contact("F", { broker: "france" })];
    expect(nodes(render(), p => p.className?.startsWith("contact-row") && p.id).map(p => p.id)).toEqual([broker === "maxime" ? "contact-M" : "contact-F"]);
    state.query = "broker=all"; expect(nodes(render(), p => p.className?.startsWith("contact-row") && p.id)).toHaveLength(2);
  });
  it("opens CRM email with the selected sender and retains telephone links", () => {
    state.contacts = [contact("A", { broker: "france" })]; let tree = render();
    nodes(tree, p => p["aria-label"] === "Envoyer un courriel à Camille Exemple A")[0].onClick();
    const email = nodes(render(), (_, t) => t === ContactEmailModal)[0]; expect(email.selectedBroker).toBe("Maxime"); expect(email.contactId).toBe("A");
    expect(nodes(tree, p => p.href?.startsWith("tel:"))[0].href).toBe("tel:5145550100"); expect(nodes(tree, p => p.href?.startsWith("mailto:"))).toHaveLength(0);
  });
  it("exposes bulk selection only for unassigned contacts and retains confirmation", () => {
    state.contacts = [contact("A"), contact("U", { broker: "unassigned" })]; expect(nodes(render(), p => p.type === "checkbox")).toHaveLength(0);
    state.query = "broker=unassigned"; nodes(render(), p => p["aria-label"] === "Sélectionner Camille Exemple U")[0].onChange(); button(render(), "Supprimer").onClick();
    expect(nodes(render(), (_, t) => t === ContactBulkDeleteModal)[0].contacts.map((c: Contact) => c.id)).toEqual(["U"]); expect(state.remove).not.toHaveBeenCalled();
  });
  it("creates through details and broker assignment without introducing Immoplus", async () => {
    button(render(), "Ajouter un contact").onClick(); nodes(render(), (_, t) => t === "input")[1].onChange({ target: { value: "Synthétique" } });
    nodes(render(), p => p.className === "manual-contact-form")[0].onSubmit({ preventDefault() {} });
    const choices = nodes(render(), p => p.className === "broker-choice-grid")[0]; expect(renderToStaticMarkup(choices.children)).not.toContain("Immoplus");
    await button(choices.children, "Maxime").onClick(); expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Synthétique" }), "maxime", expect.objectContaining({ creationKey: expect.any(String) }));
  });
  it.each(["csv", "vcard"])("analyzes %s before committing the import", async kind => {
    button(render(), kind === "csv" ? "Importer CSV" : "Importer vCard").onClick();
    const contents = kind === "csv" ? "Prénom,Nom,Email\nCamille,Exemple,camille@example.test" : "BEGIN:VCARD\nVERSION:3.0\nN:Exemple;Camille;;;\nFN:Camille Exemple\nEMAIL:camille@example.test\nEND:VCARD";
    const file = { name: kind === "csv" ? "anonyme.csv" : "anonyme.vcf", arrayBuffer: async () => new TextEncoder().encode(contents).buffer };
    nodes(render(), p => p.className?.startsWith("import-drop-zone"))[0].onDrop({ preventDefault() {}, dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(nodes(render(), p => p.className === "import-review-shell")).toHaveLength(1));
    expect(state.importContacts).not.toHaveBeenCalled(); expect(renderToStaticMarkup(render())).toContain("Camille Exemple");
    await button(render(), "TERMINER L’IMPORT").onClick(); expect(state.importContacts).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ draft: expect.objectContaining({ email: "camille@example.test" }) })]), kind);
  });
  it("routes manual duplicate creation to the existing resolution modal", async () => {
    state.contacts = [contact("existing")]; button(render(), "Ajouter un contact").onClick();
    nodes(render(), p => p.type === "email")[0].onChange({ target: { value: "existing@example.test" } });
    nodes(render(), p => p.className === "manual-contact-form")[0].onSubmit({ preventDefault() {} });
    const choices = nodes(render(), p => p.className === "broker-choice-grid")[0]; await button(choices.children, "Maxime").onClick();
    const duplicate = nodes(render(), (_, t) => t === DuplicateResolutionModal)[0]; expect(duplicate.existing.id).toBe("existing"); expect(state.create).not.toHaveBeenCalled();
    await duplicate.onMerge({ firstName: "Fusion" }); expect(state.merge).toHaveBeenCalledWith("existing", expect.objectContaining({ email: "existing@example.test" }), { firstName: "Fusion" });
  });
});
