export type ContactBulkDeleteResult = {
  deletedIds: string[];
  failedIds: string[];
};

export function toggleVisibleContactSelection(
  current: ReadonlySet<string>,
  visibleIds: ReadonlyArray<string>,
) {
  const next = new Set(current);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => current.has(id));

  for (const id of visibleIds) {
    if (allVisibleSelected) next.delete(id);
    else next.add(id);
  }

  return next;
}

export function retainUnassignedContactSelection(
  current: Set<string>,
  contacts: ReadonlyArray<{ id: string; broker: string }>,
): Set<string> {
  const unassignedIds = new Set(
    contacts.filter((contact) => contact.broker === "unassigned").map((contact) => contact.id),
  );
  const next = new Set([...current].filter((id) => unassignedIds.has(id)));
  return next.size === current.size ? current : next;
}

export async function deleteContactsSequentially(
  contactIds: ReadonlyArray<string>,
  deleteContact: (contactId: string) => Promise<void>,
  onDeleted?: (contactId: string) => void,
): Promise<ContactBulkDeleteResult> {
  const deletedIds: string[] = [];
  const failedIds: string[] = [];

  for (const contactId of contactIds) {
    try {
      await deleteContact(contactId);
      deletedIds.push(contactId);
      onDeleted?.(contactId);
    } catch {
      failedIds.push(contactId);
    }
  }

  return { deletedIds, failedIds };
}
