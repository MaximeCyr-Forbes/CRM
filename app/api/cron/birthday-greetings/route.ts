import { timingSafeEqual } from "node:crypto";
import { runGreetingFallbacks } from "../../../lib/purchase-anniversary/fallbacks";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.BIRTHDAY_CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Accès refusé." }, { status: 401 });
  try { return Response.json(await runGreetingFallbacks(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Traitement anniversaire indisponible." }, { status: 502 }); }
}
