"use client";
import { useEffect, useState } from "react";
import type { ContactBroker } from "../../data/contact-types";
import type { DailyNotification } from "../dashboard/daily-notifications";
type Item = { id: string; transactionId: string; contactId: string; broker: ContactBroker; name: string; address: string; years: number };
export function usePurchaseNotifications(broker: ContactBroker | undefined, today: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      if (running) return;
      running = true;
      try {
        const response = await fetch("/api/purchase-anniversary-greetings", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted) { setItems(data.notifications); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { running = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [today, revision]);
  const notifications: DailyNotification[] = broker ? items.filter(item => item.broker === broker || item.broker === "unassigned").map(item => ({
    id: `purchase:${item.id}`, type: "purchase_anniversary", title: item.name,
    detail: item.address, secondaryDetail: `${item.years} an${item.years > 1 ? "s" : ""} depuis l’achat`,
    href: `/contacts/${item.contactId}`, priority: 51, entityId: item.id,
  })) : [];
  return { notifications, error, resolve: (id: string) => { setItems(current => current.filter(item => item.id !== id)); setRevision(v => v + 1); } };
}
