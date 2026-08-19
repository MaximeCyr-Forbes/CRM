"use client";

import { useCallback } from "react";
import { useCRMData } from "./crm-data-context";

export function useClientNotes() {
  const { notes, addNote, updateNote, deleteNote, loadNotesForContact } = useCRMData();
  const getNotesForContact = useCallback(
    (contactId: string) =>
      notes
        .filter((note) => note.contactId === contactId)
        .sort(
          (first, second) =>
            new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
        ),
    [notes],
  );

  return { notes, getNotesForContact, loadNotesForContact, addNote, updateNote, deleteNote };
}
