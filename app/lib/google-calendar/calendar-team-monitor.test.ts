import { describe, expect, it, vi } from "vitest";
import type { CalendarBroker, CalendarWatchState } from "../../data/calendar-types";
import { startCalendarSyncMonitor } from "./calendar-sync-monitor";
import { startCalendarTeamSyncMonitors } from "./calendar-team-monitor";

const watchState: CalendarWatchState = {
  changeVersion: 10,
  lastNotificationAt: null,
  watchActive: true,
  expiresAt: "2026-08-28T00:00:00.000Z",
};

describe("surveillance du calendrier d’équipe", () => {
  it("crée un monitor indépendant et rafraîchit uniquement le courtier concerné", async () => {
    const refreshBroker = vi.fn(async (_broker: CalendarBroker) => undefined);
    const dispose = vi.fn();
    const starters: Array<Parameters<typeof startCalendarSyncMonitor>[0]> = [];
    const teamMonitor = startCalendarTeamSyncMonitors(
      ["france", "maxime", "sandrine"],
      (broker) => ({
        checkState: async () => watchState,
        ensureWatch: async () => watchState,
        refreshEvents: () => refreshBroker(broker),
      }),
      (options) => { starters.push(options); return { dispose }; },
    );

    expect(starters).toHaveLength(3);
    await starters[0].refreshEvents();
    expect(refreshBroker).toHaveBeenCalledExactlyOnceWith("france");
    teamMonitor.dispose();
    expect(dispose).toHaveBeenCalledTimes(3);
  });
});
