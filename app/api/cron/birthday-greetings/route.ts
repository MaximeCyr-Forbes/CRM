import { timingSafeEqual } from "node:crypto";
import { runBirthdayFallback } from "../../../lib/birthday-greetings/service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.BIRTHDAY_CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Accès refusé." }, { status: 401 });
  try { return Response.json(await runBirthdayFallback(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Traitement anniversaire indisponible." }, { status: 502 }); }
}
