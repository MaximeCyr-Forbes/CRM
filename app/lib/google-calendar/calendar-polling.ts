import { CALENDAR_POLL_INTERVAL_MS } from "./calendar-events";

type CalendarPollingOptions = {
  refresh: () => Promise<void>;
  intervalMs?: number;
  windowTarget?: Pick<Window, "addEventListener" | "removeEventListener" | "setInterval" | "clearInterval">;
  documentTarget?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;
};

export function startCalendarPolling({
  refresh,
  intervalMs = CALENDAR_POLL_INTERVAL_MS,
  windowTarget = window,
  documentTarget = document,
}: CalendarPollingOptions) {
  let disposed = false;
  let inFlight = false;
  const run = async () => {
    if (disposed || inFlight) return;
    inFlight = true;
    try {
      await refresh();
    } finally {
      inFlight = false;
    }
  };
  const interval = windowTarget.setInterval(() => void run(), intervalMs);
  const onFocus = () => void run();
  const onVisibilityChange = () => {
    if (documentTarget.visibilityState === "visible") void run();
  };
  windowTarget.addEventListener("focus", onFocus);
  documentTarget.addEventListener("visibilitychange", onVisibilityChange);
  return {
    run,
    dispose() {
      disposed = true;
      windowTarget.clearInterval(interval);
      windowTarget.removeEventListener("focus", onFocus);
      documentTarget.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}
