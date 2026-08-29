import type { CalendarWatchState } from "../../data/calendar-types";

export const CALENDAR_CHANGE_CHECK_INTERVAL_MS = 3_000;
export const CALENDAR_INACTIVE_WATCH_POLL_INTERVAL_MS = 15_000;
export const CALENDAR_SAFETY_REFRESH_INTERVAL_MS = 120_000;
export const CALENDAR_WATCH_ENSURE_INTERVAL_MS = 30 * 60_000;

type TimerTarget = Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">;
type VisibilityTarget = Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;

type CalendarSyncMonitorOptions = {
  checkState: () => Promise<CalendarWatchState>;
  ensureWatch: () => Promise<CalendarWatchState | void>;
  refreshEvents: () => Promise<void>;
  windowTarget?: TimerTarget;
  documentTarget?: VisibilityTarget;
  now?: () => number;
};

export function startCalendarSyncMonitor({
  checkState,
  ensureWatch,
  refreshEvents,
  windowTarget = window,
  documentTarget = document,
  now = Date.now,
}: CalendarSyncMonitorOptions) {
  let disposed = false;
  let stateInFlight = false;
  let refreshInFlight = false;
  let watchActive = false;
  let lastSeenChangeVersion: number | null = null;
  let lastFullRefreshAt = now();

  const refreshOnce = async () => {
    if (disposed || refreshInFlight) return;
    refreshInFlight = true;
    try {
      await refreshEvents();
      lastFullRefreshAt = now();
    } finally {
      refreshInFlight = false;
    }
  };

  const check = async () => {
    if (disposed || stateInFlight || documentTarget.visibilityState !== "visible") return;
    stateInFlight = true;
    try {
      const state = await checkState();
      watchActive = state.watchActive;
      const changed =
        lastSeenChangeVersion !== null &&
        state.changeVersion !== lastSeenChangeVersion;
      lastSeenChangeVersion = state.changeVersion;
      if (changed) await refreshOnce();
    } catch {
      watchActive = false;
    } finally {
      stateInFlight = false;
    }
  };

  const ensure = async () => {
    if (disposed || documentTarget.visibilityState !== "visible") return;
    try {
      const state = await ensureWatch();
      if (state) {
        watchActive = state.watchActive;
        if (lastSeenChangeVersion === null) lastSeenChangeVersion = state.changeVersion;
      }
    } catch {
      watchActive = false;
    }
  };

  const changeInterval = windowTarget.setInterval(
    () => void check(),
    CALENDAR_CHANGE_CHECK_INTERVAL_MS,
  );
  const fallbackInterval = windowTarget.setInterval(() => {
    if (documentTarget.visibilityState !== "visible") return;
    if (!watchActive || now() - lastFullRefreshAt >= CALENDAR_SAFETY_REFRESH_INTERVAL_MS) {
      void refreshOnce();
    }
  }, CALENDAR_INACTIVE_WATCH_POLL_INTERVAL_MS);
  const ensureInterval = windowTarget.setInterval(
    () => void ensure(),
    CALENDAR_WATCH_ENSURE_INTERVAL_MS,
  );
  const refreshAfterReturn = () => {
    void check();
    void refreshOnce();
  };
  const onFocus = refreshAfterReturn;
  const onVisibilityChange = () => {
    if (documentTarget.visibilityState === "visible") refreshAfterReturn();
  };
  windowTarget.addEventListener("focus", onFocus);
  documentTarget.addEventListener("visibilitychange", onVisibilityChange);
  void ensure().then(() => check());

  return {
    check,
    dispose() {
      disposed = true;
      windowTarget.clearInterval(changeInterval);
      windowTarget.clearInterval(fallbackInterval);
      windowTarget.clearInterval(ensureInterval);
      windowTarget.removeEventListener("focus", onFocus);
      documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
