import type { CalendarBroker } from "../../data/calendar-types";
import { startCalendarSyncMonitor } from "./calendar-sync-monitor";

type MonitorOptions = Parameters<typeof startCalendarSyncMonitor>[0];
type MonitorStarter = (options: MonitorOptions) => { dispose: () => void };

export function startCalendarTeamSyncMonitors(
  brokers: ReadonlyArray<CalendarBroker>,
  optionsForBroker: (broker: CalendarBroker) => MonitorOptions,
  startMonitor: MonitorStarter = startCalendarSyncMonitor,
) {
  const monitors = brokers.map((broker) => startMonitor(optionsForBroker(broker)));
  return {
    dispose() {
      monitors.forEach((monitor) => monitor.dispose());
    },
  };
}
