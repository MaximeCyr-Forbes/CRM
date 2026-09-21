import { beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WorkspaceUser, WorkingBroker } from "./lib/workspace";
const state = vi.hoisted(() => ({
  url: "/", workspaceUser: null as WorkspaceUser | null, workingBroker: null as WorkingBroker | null,
  ready: true, effects: [] as Array<() => void>, pushes: [] as string[],
}));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useEffect: (effect: () => void) => state.effects.push(effect) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URL(state.url, "https://crm.test").searchParams,
  useRouter: () => ({ push: (url: string) => { state.pushes.push(url); state.url = url; }, replace: () => { throw new Error("Selection must push history"); } }),
}));
vi.mock("./broker-context", () => ({
  BROKERS: ["France", "Maxime", "Sandrine"],
  useBroker: () => ({
    workspaceUser: state.workspaceUser, workingBroker: state.workingBroker, isBrokerReady: state.ready,
    selectWorkspace: (user: WorkspaceUser) => { state.workspaceUser = user; state.workingBroker = user === "immoplus" ? null : user; },
    selectBroker: (broker: string) => { state.workingBroker = broker.toLowerCase() as WorkingBroker; },
  }),
}));
import { SelectionPage } from "./selection-page";
function render() {
  const tree = SelectionPage();
  const markup = renderToStaticMarkup(tree);
  state.effects.splice(0).forEach(effect => effect());
  return { tree, markup };
}
function click(label: string) {
  let clicked = false;
  function visit(node: ReactNode) {
    if (!isValidElement<{ children?: ReactNode; className?: string; disabled?: boolean; onClick?: () => void }>(node)) return;
    if (node.type === "button" && node.props.className === "broker-card" && renderToStaticMarkup(node).includes(`>${label}</span>`)) {
      expect(node.props.disabled).toBeFalsy(); node.props.onClick!(); clicked = true; return;
    }
    Children.forEach(node.props.children, visit);
  }
  visit(render().tree);
  expect(clicked).toBe(true);
}
beforeEach(() => { Object.assign(state, { url: "/", workspaceUser: null, workingBroker: null, ready: true, effects: [], pushes: [] }); });
describe("SelectionPage browser history", () => {
  it("pushes a distinct Immoplus URL before choosing a broker", () => {
    click("IMMOPLUS");
    expect(state.pushes).toEqual(["/?workspace=immoplus"]);
    expect(state.workingBroker).toBeNull();
    expect(render().markup).toContain("POUR QUEL COURTIER TRAVAILLEZ-VOUS ?");
  });
  it("root shows four users even with a saved assistant broker", () => {
    state.workspaceUser = "immoplus"; state.workingBroker = "maxime";
    const html = render().markup;
    expect(html.match(/class="broker-card"/g)).toHaveLength(4);
    expect(html).toContain(">IMMOPLUS</span>");
    expect(state.workingBroker).toBe("maxime");
  });
  it("Back / Back / Forward / Forward reads URL without erasing the business session or pushing", () => {
    click("IMMOPLUS"); click("MAXIME");
    expect(state.pushes).toEqual(["/?workspace=immoplus", "/dashboard"]);
    state.url = "/?workspace=immoplus";
    expect(render().markup.match(/class="broker-card"/g)).toHaveLength(3);
    state.url = "/";
    expect(render().markup.match(/class="broker-card"/g)).toHaveLength(4);
    state.url = "/?workspace=immoplus";
    expect(render().markup).toContain("POUR QUEL COURTIER TRAVAILLEZ-VOUS ?");
    state.url = "/dashboard";
    expect(state.workspaceUser).toBe("immoplus"); expect(state.workingBroker).toBe("maxime");
    expect(state.pushes).toHaveLength(2);
  });
  it.each([null, "france", "immoplus"] as const)("direct URL/F5 initializes assistant from %s without a navigation loop", (user) => {
    state.workspaceUser = user; state.url = "/?workspace=immoplus";
    expect(render().markup).toContain("POUR QUEL COURTIER TRAVAILLEZ-VOUS ?");
    expect(state.workspaceUser).toBe("immoplus");
    render(); expect(state.pushes).toEqual([]);
    click("SANDRINE"); expect(state.url).toBe("/dashboard"); expect(state.workingBroker).toBe("sandrine");
  });
  it("invalid workspace falls back to user selection", () => {
    state.url = "/?workspace=banana";
    expect(render().markup.match(/class="broker-card"/g)).toHaveLength(4);
    expect(state.workspaceUser).toBeNull(); expect(state.pushes).toEqual([]);
  });
  it.each(["FRANCE", "MAXIME", "SANDRINE"])("%s goes directly to dashboard", (label) => {
    click(label); expect(state.pushes).toEqual(["/dashboard"]); expect(state.workingBroker).toBe(label.toLowerCase());
  });
  it("keeps the authorized return destination across both assistant steps", () => {
    state.url = "/?returnTo=%2Fmortgage-referrals";
    click("IMMOPLUS"); expect(state.url).toBe("/?workspace=immoplus&returnTo=%2Fmortgage-referrals");
    click("FRANCE"); expect(state.url).toBe("/mortgage-referrals");
  });
  it("waits for session hydration before initializing a direct assistant URL", () => {
    state.url = "/?workspace=immoplus"; state.ready = false;
    render(); expect(state.workspaceUser).toBeNull();
    state.ready = true; render(); expect(state.workspaceUser).toBe("immoplus");
  });
});
