"use client";

import { useCallback, useMemo } from "react";
import { useCRMData } from "./crm-data-context";
import { calculateFollowUpDate, type FollowUpPreset } from "./lib/follow-up";

export function useFollowUps() {
  const { contacts, updateFollowUp, retry } = useCRMData();
  const followUpDates = useMemo(
    () =>
      Object.fromEntries(
        contacts.map((contact) => [contact.id, contact.nextFollowUpDate]),
      ) as Record<string, string | null>,
    [contacts],
  );

  const getFollowUpDate = useCallback(
    (clientId: string) => followUpDates[clientId] ?? null,
    [followUpDates],
  );

  const scheduleFollowUp = useCallback(
    async (clientId: string, preset: FollowUpPreset, customDate?: string) => {
      const nextDate = calculateFollowUpDate(preset, customDate);
      const calendarSync = await updateFollowUp(clientId, nextDate);
      return { nextDate, calendarSync };
    },
    [updateFollowUp],
  );

  const completeFollowUp = useCallback(
    async (clientId: string) => {
      const contact = contacts.find(item => item.id === clientId);
      if (!contact?.nextFollowUpDate) throw new Error("Aucune relance programmée à confirmer.");
      const response = await fetch(`/api/contacts/${clientId}/follow-up-completions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", scheduledFor: contact.nextFollowUpDate, version: contact.updatedAt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Confirmation impossible.");
      await retry();
      return result as { calendarSync: import("./data/calendar-types").CalendarSyncResult };
    },
    [contacts, retry],
  );

  return { completeFollowUp, followUpDates, getFollowUpDate, scheduleFollowUp };
}
