import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { appNavigationOrder, softwareLinks } from "../data/software-links";

const state = vi.hoisted(() => ({ pathname: "/dashboard", workspaceUser: "france", selectedBroker: "France", open: false, push: vi.fn(), replace: vi.fn(), selectBroker: vi.fn(), clearBroker: vi.fn(), setOpen: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useEffect: () => {}, useRef: () => ({ current: null }), useId: () => "software-test", useState: () => [state.open, state.setOpen] }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push, replace: state.replace }) }));
vi.mock("../broker-context", () => ({ BROKERS: ["France", "Maxime", "Sandrine"], useBroker: () => ({ ...state }) }));
vi.mock("./global-search", () => ({ GlobalSearch: () => createElement("button", { "aria-label": "Ouvrir la recherche globale" }) }));
vi.mock("./account-menu", () => ({ AccountMenu: () => createElement("button", { "aria-label": "Menu d’accès équipe" }) }));
vi.mock("./app-header", () => ({ AppHeader: () => createElement("header", null, "Selection header") }));
import { AppSidebar, shellLinks } from "./app-sidebar";
import { AppShell } from "./app-shell";
import { AppTopbar } from "./app-topbar";

function find(tree: ReactNode, predicate: (props: Record<string, unknown>, type: unknown) => boolean) {
  let result: Record<string, unknown> | undefined;
  function walk(node: ReactNode) {
    if (!isValidElement<Record<string, unknown>>(node)) return;
    if (predicate(node.props, node.type)) result = node.props;
    Children.forEach(node.props.children as ReactNode, walk);
  }
  walk(tree); if (!result) throw new Error("Element missing"); return result;
}
const sidebar = (navigate = vi.fn(), onClose?: () => void) => AppSidebar({ pathname: state.pathname, workspaceUser: state.workspaceUser, selectedBroker: state.selectedBroker, navigate, onClose });
const topbar = () => AppTopbar({ onOpenMenu: vi.fn(), menuOpen: state.open, menuButtonRef: { current: null } });
beforeEach(() => { vi.clearAllMocks(); Object.assign(state, { pathname: "/dashboard", workspaceUser: "france", selectedBroker: "France", open: false }); });

describe("premium shell preserves the CRM navigation contract", () => {
  it("renders every existing destination in the existing order", () => {
    const html = renderToStaticMarkup(sidebar());
    let previous = -1;
    for (const label of appNavigationOrder) { const position = html.indexOf(`<span>${label}</span>`); expect(position).toBeGreaterThan(previous); previous = position; }
    expect(shellLinks.map(link => link.href)).toEqual(["/dashboard", "/contacts", "/listings", "/transactions", "/mortgage-referrals", "/calendar", "/drive", "/statistics", "/automatic-emails", "/settings"]);
  });
  it.each(shellLinks)("keeps the $label destination and active state on details", link => {
    state.pathname = `${link.href}/example`;
    const navigate = vi.fn(); const tree = sidebar(navigate);
    const props = find(tree, props => props["aria-current"] === "page");
    (props.onClick as () => void)(); expect(navigate).toHaveBeenCalledWith(link.href);
    expect(renderToStaticMarkup(tree).match(/aria-current="page"/g)).toHaveLength(1);
  });
  it("keeps all software URLs and safely closes the mobile drawer after an external link", () => {
    state.open = true; const close = vi.fn(); const tree = sidebar(vi.fn(), close);
    const html = renderToStaticMarkup(tree);
    for (const link of softwareLinks) expect(html).toContain(`href="${link.href}"`);
    const link = find(tree, (props, type) => type === "a" && props.href === softwareLinks[0].href);
    expect(link.target).toBe("_blank"); expect(link.rel).toBe("noopener noreferrer");
    (link.onClick as () => void)(); expect(close).toHaveBeenCalledOnce(); expect(state.setOpen).toHaveBeenCalledWith(false);
  });
  it("mounts existing search and account menu exactly once", () => {
    const html = renderToStaticMarkup(createElement(AppShell, null, "Existing content"));
    expect(html.match(/aria-label="Ouvrir la recherche globale"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Menu d’accès équipe"/g)).toHaveLength(1);
    expect(html).toContain("Existing content"); expect(html).not.toContain("Selection header");
  });
  it("keeps user selection on the original header", () => {
    state.pathname = "/";
    const html = renderToStaticMarkup(createElement(AppShell, null, "Selection"));
    expect(html).toContain("Selection header"); expect(html).not.toContain("crm-sidebar");
  });
  it("distinguishes Immoplus identity from working broker", () => {
    state.workspaceUser = "immoplus"; state.selectedBroker = "Maxime";
    expect(renderToStaticMarkup(sidebar())).toContain("Adjointe · Maxime");
    const tree = topbar(); const html = renderToStaticMarkup(tree);
    expect(html).toContain("IMMOPLUS"); expect(html).toContain("Adjointe");
    const select = find(tree, props => props["aria-label"] === "Courtier de travail");
    expect(select.value).toBe("Maxime");
    (select.onChange as (event: unknown) => void)({ target: { value: "Sandrine" } });
    expect(state.selectBroker).toHaveBeenCalledWith("Sandrine"); expect(state.replace).toHaveBeenCalledWith("/dashboard");
    expect(state.push).not.toHaveBeenCalled();
  });
  it("does not offer an assistant broker selector to a broker", () => {
    expect(renderToStaticMarkup(topbar())).not.toContain("<select");
  });
  it("preserves explicit workspace reset and mortgage returnTo", () => {
    state.pathname = "/mortgage-referrals";
    const button = find(topbar(), props => props.className === "crm-change-user");
    (button.onClick as () => void)(); expect(state.clearBroker).toHaveBeenCalledOnce(); expect(state.push).toHaveBeenCalledWith("/?returnTo=%2Fmortgage-referrals");
  });
  it("closes the drawer before pushing an existing route", () => {
    state.open = true;
    const tree = AppShell({ children: "Content" });
    const props = find(tree, (_, type) => type === AppSidebar);
    (props.navigate as (href: string) => void)("/contacts");
    expect(state.setOpen).toHaveBeenCalledWith(false); expect(state.push).toHaveBeenCalledWith("/contacts");
  });
  it("exposes mobile controls and closes on Escape and backdrop", () => {
    state.open = true;
    const props = find(AppShell({ children: "Content" }), (_, type) => type === "dialog");
    expect(props["aria-label"]).toBe("Navigation du CRM");
    (props.onCancel as () => void)(); expect(state.setOpen).toHaveBeenCalledWith(false);
    state.setOpen.mockClear(); const target = {};
    (props.onClick as (event: unknown) => void)({ target, currentTarget: target });
    expect(state.setOpen).toHaveBeenCalledWith(false);
    expect(renderToStaticMarkup(topbar())).toContain('aria-expanded="true"');
  });
  it("retains the server access gate and scopes presentation without CSS deletion", () => {
    const layout = readFileSync("app/components/private-route-layout.tsx", "utf8");
    expect(layout).toContain("await hasCRMAccess()"); expect(layout).toContain('redirect("/login")'); expect(layout).toContain("<WorkspaceGate>{children}</WorkspaceGate>");
    const css = readFileSync("app/app-shell.css", "utf8");
    expect(css).toContain("@media (max-width: 1099px)"); expect(css).toContain("env(safe-area-inset-bottom)"); expect(css).toContain("prefers-reduced-motion");
  });
});
