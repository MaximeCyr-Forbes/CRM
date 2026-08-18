"use client";

import { useCRMData } from "./crm-data-context";

export function useContacts() {
  const {
    contacts,
    addManualContact,
    importContacts,
    assignContact,
    assignContacts,
    updateContact,
    saveContactAddresses,
    updatePipelineStage,
    deleteContact,
    mergeDraftIntoContact,
    mergeContacts,
  } = useCRMData();

  return {
    contacts,
    addManualContact,
    importContacts,
    assignContact,
    assignContacts,
    updateContact,
    saveContactAddresses,
    updatePipelineStage,
    deleteContact,
    mergeDraftIntoContact,
    mergeContacts,
  };
}
