import { runBirthdayFallback } from "../birthday-greetings/service";
import { runPurchaseAnniversaryFallback } from "./service";
export async function runGreetingFallbacks() {
  // One unavailable rule must not prevent the other independent workflow.
  const results = await Promise.allSettled([runBirthdayFallback(), runPurchaseAnniversaryFallback()]);
  return Object.fromEntries(results.map((result, index) => [index === 0 ? "birthday" : "purchaseAnniversary", result.status === "fulfilled" ? result.value : { error: "Traitement temporairement indisponible." }]));
}
