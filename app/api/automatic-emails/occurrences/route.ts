import { requireApiAccess } from "../../../lib/crm-access";
import { isAutomaticEmailRuleId } from "../../../data/automatic-email-types";
import { getAutomaticEmailOccurrences } from "../../../lib/automatic-emails/server-service";

export const dynamic = "force-dynamic";

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function todayInQuebec() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function GET(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  const search = new URL(request.url).searchParams;
  const today = todayInQuebec();
  const from = search.get("from") ?? today;
  const to = search.get("to") ?? new Date(`${today}T12:00:00Z`).toISOString().slice(0, 10);
  const ruleId = search.get("ruleId");
  if (!validDate(from) || !validDate(to) || from > to || (ruleId !== null && !isAutomaticEmailRuleId(ruleId))) {
    return Response.json({ error: "Paramètres de simulation invalides." }, { status: 400 });
  }
  const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
  if (days > 366) return Response.json({ error: "La simulation est limitée à 366 jours." }, { status: 400 });
  try {
    const result = await getAutomaticEmailOccurrences({ from, to, ruleId, today });
    return result
      ? Response.json({ data: result, simulationOnly: true }, { headers: { "Cache-Control": "private, no-store" } })
      : Response.json({ error: "Règle introuvable." }, { status: 404 });
  } catch (error) {
    console.error("Erreur simulation courriels automatiques:", error instanceof Error ? error.message : "erreur inconnue");
    return Response.json({ error: "Simulation temporairement indisponible." }, { status: 502 });
  }
}
