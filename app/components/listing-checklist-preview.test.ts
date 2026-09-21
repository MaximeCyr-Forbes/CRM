import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ visible: true, loading: false, error: null as string | null, type: "residential", tracking: true }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(), useState: () => [state.visible, vi.fn()], useRef: () => ({ current: null }), useEffect: () => undefined }));
vi.mock("../lib/listings/use-listing-report", () => ({ useListingReport: () => ({ isLoading: state.loading, error: state.error, data: { listing: { propertyType: state.type }, tracking: state.tracking ? { tasks: [
  { taskKey: "photos", isCustom: false, completed: true },
  { taskKey: "owner_deed", isCustom: false, completed: false },
  { taskKey: "documents", isCustom: false, completed: true },
  { taskKey: "condo_declaration", isCustom: false, completed: false },
  { taskKey: "land_zoning_grid", isCustom: false, completed: false },
] } : null } }) }));
import { ListingChecklistPreview } from "./listing-checklist-preview";
const html = () => renderToStaticMarkup(createElement(ListingChecklistPreview, { listingId: "synthetic" }));
beforeEach(() => Object.assign(state, { visible: true, loading: false, error: null, type: "residential", tracking: true }));
describe("inventory checklist preview", () => {
  it("uses actual progress without counting the structural documents parent", () => { expect(html()).toContain('max="2" value="1"'); });
  it.each(["condo", "land"])("uses the existing %s visibility rules", type => { state.type = type; expect(html()).toContain('max="3" value="1"'); });
  it("does not render loaded progress before the card becomes visible", () => { state.visible = false; expect(html()).not.toContain("<progress"); });
  it("does not invent zero progress while loading", () => { state.loading = true; expect(html()).toContain("Chargement"); expect(html()).not.toContain("<progress"); });
  it("does not invent zero progress when report data is unavailable", () => { state.tracking = false; expect(html()).toContain("Indisponible"); expect(html()).not.toContain("<progress"); });
});
