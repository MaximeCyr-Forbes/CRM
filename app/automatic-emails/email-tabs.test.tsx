// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmailTabs, useEmailTab } from "./email-tabs";
import { useState } from "react";
function Workspace() {
  const [tab, select] = useEmailTab();
  const [draft, setDraft] = useState("");
  return <><EmailTabs activeTab={tab} onSelect={select} /><div hidden={tab !== "campaigns"}><input aria-label="Brouillon" value={draft} onChange={e => setDraft(e.target.value)} /></div><output>{tab}</output></>;
}
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/automatic-emails"); });
describe("navigation Courriels sans mutation métier", () => {
  it("ouvre Campagnes par défaut et conserve le brouillon entre les sections", () => {
    render(<Workspace />);
    expect(screen.getByRole("button", { name: "Campagnes" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("Brouillon"), { target: { value: "À conserver" } });
    fireEvent.click(screen.getByRole("button", { name: "Automatisations" }));
    expect(window.location.search).toBe("?tab=automations");
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Campagnes" }));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("À conserver");
  });
  it("restaure le lien direct après remontage et les changements d’historique", async () => {
    window.history.replaceState(null, "", "/automatic-emails?tab=settings&keep=1");
    const view = render(<Workspace />);
    expect(screen.getByRole("button", { name: "Paramètres" }).getAttribute("aria-pressed")).toBe("true");
    view.unmount(); render(<Workspace />);
    expect(screen.getByRole("button", { name: "Paramètres" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Automatisations" }));
    expect(window.location.search).toBe("?tab=automations&keep=1");
    act(() => { window.history.replaceState(null, "", "/automatic-emails?tab=settings"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Paramètres" }).getAttribute("aria-pressed")).toBe("true"));
  });
  it("revient à Campagnes pour une section inconnue", () => {
    window.history.replaceState(null, "", "/automatic-emails?tab=unknown"); render(<Workspace />);
    expect(screen.getByRole("button", { name: "Campagnes" }).getAttribute("aria-pressed")).toBe("true");
  });
});
