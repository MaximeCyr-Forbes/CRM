import { APP_CURRENCY, APP_LOCALE } from "@/app/lib/tools/plex/config/locale";
import type { Money } from "@/app/lib/tools/plex/domain/models";

const cadFormatter = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: APP_CURRENCY,
});

export function formatCad(money: Money): string {
  return cadFormatter.format(money.amountInCents / 100);
}
