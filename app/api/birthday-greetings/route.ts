import { requireApiAccess } from "../../lib/crm-access";
import { todayGreetings } from "../../lib/birthday-greetings/service";
import { birthdayClock } from "../../lib/birthday-greetings/model";
export const dynamic = "force-dynamic";
export async function GET() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    const states = await todayGreetings();
    return Response.json({ today: birthdayClock().today, states: states.map(s => ({ contactId: s.contact_id, status: s.status, error: s.error_message })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "État des anniversaires indisponible." }, { status: 502 }); }
}
