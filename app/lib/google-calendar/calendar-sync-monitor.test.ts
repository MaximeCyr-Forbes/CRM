import { describe, expect, it, vi } from "vitest";
import type { CalendarWatchState } from "../../data/calendar-types";
import {
  CALENDAR_CHANGE_CHECK_INTERVAL_MS,
  CALENDAR_INACTIVE_WATCH_POLL_INTERVAL_MS,
  startCalendarSyncMonitor,
} from "./calendar-sync-monitor";

const state = (changeVersion: number, watchActive = true): CalendarWatchState => ({
  changeVersion,
  lastNotificationAt: null,
  watchActive,
  expiresAt: watchActive ? "2026-08-28T00:00:00.000Z" : null,
});

function targets() {
  const intervals = new Map<number, { callback: () => void; delay: number }>();
  const windowListeners = new Map<string, EventListener>();
  const documentListeners = new Map<string, EventListener>();
  let nextId = 1;
  const windowTarget = {
    setInterval: vi.fn((callback: () => void, delay: number) => {
      const id = nextId++;
      intervals.set(id, { callback, delay });
      return id;
    }),
    clearInterval: vi.fn((id: number) => intervals.delete(id)),
    addEventListener: vi.fn((name: string, listener: EventListener) => windowListeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => windowListeners.delete(name)),
  };
  const documentTarget = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: vi.fn((name: string, listener: EventListener) => documentListeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => documentListeners.delete(name)),
  };
  return { intervals, windowListeners, documentListeners, windowTarget, documentTarget };
}

describe("surveillance légère du calendrier", () => {
  it("rafraîchit exactement une fois lorsque changeVersion augmente", async () => {
    const environment = targets();
    const versions = [state(10), state(11), state(11)];
    const checkState = vi.fn(async () => versions.shift() ?? state(11));
    const refreshEvents = vi.fn(async () => undefined);
    const monitor = startCalendarSyncMonitor({
      checkState,
      ensureWatch: vi.fn(async () => state(10)),
      refreshEvents,
      windowTarget: environment.windowTarget as never,
      documentTarget: environment.documentTarget as never,
    });
    await Promise.resolve(); await Promise.resolve();
    const changeTimer = [...environment.intervals.values()].find((timer) => timer.delay === CALENDAR_CHANGE_CHECK_INTERVAL_MS)!;
    changeTimer.callback(); await Promise.resolve(); await Promise.resolve();
    changeTimer.callback(); await Promise.resolve(); await Promise.resolve();
    expect(refreshEvents).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("conserve le polling complet de 15 secondes lorsque le watch est inactif", async () => {
    const environment = targets();
    const refreshEvents = vi.fn(async () => undefined);
    const monitor = startCalendarSyncMonitor({
      checkState: vi.fn(async () => state(0, false)),
      ensureWatch: vi.fn(async () => state(0, false)),
      refreshEvents,
      windowTarget: environment.windowTarget as never,
      documentTarget: environment.documentTarget as never,
    });
    await Promise.resolve(); await Promise.resolve();
    const fallbackTimer = [...environment.intervals.values()].find((timer) => timer.delay === CALENDAR_INACTIVE_WATCH_POLL_INTERVAL_MS)!;
    fallbackTimer.callback(); await Promise.resolve();
    expect(refreshEvents).toHaveBeenCalledTimes(1);
    monitor.dispose();
  });

  it("suspend les vérifications agressives dans un onglet masqué et nettoie tout", async () => {
    const environment = targets();
    environment.documentTarget.visibilityState = "hidden";
    const checkState = vi.fn(async () => state(1));
    const monitor = startCalendarSyncMonitor({
      checkState,
      ensureWatch: vi.fn(async () => state(1)),
      refreshEvents: vi.fn(async () => undefined),
      windowTarget: environment.windowTarget as never,
      documentTarget: environment.documentTarget as never,
    });
    const changeTimer = [...environment.intervals.values()].find((timer) => timer.delay === CALENDAR_CHANGE_CHECK_INTERVAL_MS)!;
    changeTimer.callback(); await Promise.resolve();
    expect(checkState).not.toHaveBeenCalled();
    monitor.dispose();
    expect(environment.intervals.size).toBe(0);
    expect(environment.windowListeners.size).toBe(0);
    expect(environment.documentListeners.size).toBe(0);
  });
});
