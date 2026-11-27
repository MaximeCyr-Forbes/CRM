import { withCRMIdentity } from "../../../lib/auth/route";
import { requireApiAccess } from "../../../lib/crm-access";
import { STATISTICS_PERIODS, isStatisticsYear, type StatisticsBroker, type StatisticsPeriod } from "../../../data/statistics-types";
import { STATISTICS_METRICS, type StatisticsMetric } from "../../../lib/statistics/drilldown";
import { getStatisticsDrilldown, StatisticsChangedError } from "../../../lib/statistics/drilldown-service";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function GETHandler(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const params = new URL(request.url).searchParams;
  const yearText = params.get("year") ?? "";
  const year = Number(yearText);
  const period = params.get("period") as StatisticsPeriod;
  const broker = params.get("broker") as StatisticsBroker;
  const metric = params.get("metric") as StatisticsMetric;
  const month = params.get("month") ?? "";
  const pageText = params.get("page") ?? "1";
  const page = Number(pageText);
  const revision = params.get("revision");
  if (!/^\d{4}$/.test(yearText) || !isStatisticsYear(year) || !STATISTICS_PERIODS.includes(period)
    || !["team", "maxime", "france", "sandrine"].includes(broker) || !STATISTICS_METRICS.includes(metric)
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^[1-9]\d{0,2}$/.test(pageText) || page > 800
    || (page > 1 && !revision) || (revision !== null && !/^[a-f0-9]{64}$/.test(revision))
    || [...params.keys()].some((key) => !["year", "period", "broker", "metric", "month", "page", "from", "to", "revision"].includes(key) || params.getAll(key).length !== 1)) {
    return Response.json({ error: "Paramètres du détail invalides." }, { status: 400, headers });
  }
  try {
    const data = await getStatisticsDrilldown({ year, period, broker, metric, month, page, revision, from: params.get("from"), to: params.get("to") });
    return Response.json({ data }, { headers });
  } catch (error) {
    const status = error instanceof TypeError ? 400 : error instanceof StatisticsChangedError ? 409 : 500;
    return Response.json({ error: status === 500 ? "Le détail est temporairement indisponible. Réessayez." : (error as Error).message }, { status, headers });
  }
}
export const GET = withCRMIdentity(GETHandler);
