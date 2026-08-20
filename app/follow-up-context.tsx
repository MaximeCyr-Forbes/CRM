"use client";

import { useCallback, useMemo } from "react";
import { useCRMData } from "./crm-data-context";
import { calculateFollowUpDate, type FollowUpPreset } from "./lib/follow-up";

export function useFollowUps() {
  const { contacts, updateFollowUp } = useCRMData();
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
      const calendarSync = await updateFollowUp(clientId, null);
      return { calendarSync };
    },
    [updateFollowUp],
  );

  return { completeFollowUp, followUpDates, getFollowUpDate, scheduleFollowUp };
}
