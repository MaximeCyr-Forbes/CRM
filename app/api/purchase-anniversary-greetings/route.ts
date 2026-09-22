import { requireApiAccess } from "../../lib/crm-access";
import { todayPurchaseCandidates, todayPurchaseGreetings } from "../../lib/purchase-anniversary/service";
import { birthdayClock, resolvedBirthdayStatuses } from "../../lib/birthday-greetings/model";
export const dynamic = "force-dynamic";
export async function GET() {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  try {
    const [candidates, states] = await Promise.all([todayPurchaseCandidates(), todayPurchaseGreetings()]);
    const resolved = new Set(states.filter(s => resolvedBirthdayStatuses.has(s.status)).map(s => `${s.transaction_id}:${s.contact_id}`));
    const today = birthdayClock().today;
    return Response.json({ today, notifications: candidates.filter(({ contact, transaction }) => !resolved.has(`${transaction.id}:${contact.id}`)).map(({ contact, transaction }) => ({
      id: `${transaction.id}:${contact.id}`, transactionId: transaction.id, contactId: contact.id, broker: contact.broker,
      name: `${contact.first_name} ${contact.last_name}`.trim(), address: transaction.address,
      years: Number(today.slice(0, 4)) - Number(transaction.notary_date!.slice(0, 4)),
    })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Anniversaires d’achat temporairement indisponibles." }, { status: 502 }); }
}
