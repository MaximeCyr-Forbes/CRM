import { describe, expect, it, vi } from "vitest";
import { startCalendarPolling } from "./calendar-polling";

describe("polling du calendrier", () => {
  it("crée un seul intervalle, empêche les chevauchements et nettoie les écouteurs", async () => {
    let intervalCallback: (() => void) | null = null;
    const windowListeners = new Map<string, EventListener>();
    const documentListeners = new Map<string, EventListener>();
    const windowTarget = {
      setInterval: vi.fn((callback: () => void) => { intervalCallback = callback; return 17; }),
      clearInterval: vi.fn(),
      addEventListener: vi.fn((name: string, listener: EventListener) => windowListeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => windowListeners.delete(name)),
    };
    const documentTarget = {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: vi.fn((name: string, listener: EventListener) => documentListeners.set(name, listener)),
      removeEventListener: vi.fn((name: string) => documentListeners.delete(name)),
    };
    let release: (() => void) | undefined;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const polling = startCalendarPolling({ refresh, windowTarget: windowTarget as never, documentTarget: documentTarget as never });
    expect(windowTarget.setInterval).toHaveBeenCalledTimes(1);
    intervalCallback!();
    windowListeners.get("focus")!(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
    release!();
    await Promise.resolve();
    documentListeners.get("visibilitychange")!(new Event("visibilitychange"));
    expect(refresh).toHaveBeenCalledTimes(2);
    polling.dispose();
    expect(windowTarget.clearInterval).toHaveBeenCalledWith(17);
    expect(windowListeners.size).toBe(0);
    expect(documentListeners.size).toBe(0);
  });
});
