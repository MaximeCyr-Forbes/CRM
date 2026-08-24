import { requireApiAccess } from "../../lib/crm-access";
import { STATISTICS_PERIODS, type StatisticsBroker, type StatisticsPeriod } from "../../data/statistics-types";
import { getStatistics } from "../../lib/statistics/server-service";

export const dynamic = "force-dynamic";

const BROKERS = ["team", "maxime", "france", "sandrine"] as const;

function isPeriod(value: string | null): value is StatisticsPeriod {
  return Boolean(value && STATISTICS_PERIODS.includes(value as StatisticsPeriod));
}

function isBroker(value: string | null): value is StatisticsBroker {
  return Boolean(value && BROKERS.includes(value as StatisticsBroker));
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const search = new URL(request.url).searchParams;
  const periodValue = search.get("period") ?? "year";
  const brokerValue = search.get("broker") ?? "team";
  if (!isPeriod(periodValue)) return Response.json({ error: "Période invalide." }, { status: 400 });
  if (!isBroker(brokerValue)) return Response.json({ error: "Courtier invalide." }, { status: 400 });
  try {
    const data = await getStatistics({
      period: periodValue,
      broker: brokerValue,
      from: search.get("from"),
      to: search.get("to"),
    });
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TypeError) return Response.json({ error: error.message }, { status: 400 });
    console.error("Chargement des statistiques impossible:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Les statistiques sont temporairement indisponibles." }, { status: 502 });
  }
}
