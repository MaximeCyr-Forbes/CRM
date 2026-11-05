export interface ComparisonSelection {
  subjectId: string;
  comparableIds: string[];
  excludedIds: string[];
}

export function createComparisonSelection(propertyIds: string[]): ComparisonSelection {
  return {
    subjectId: propertyIds[0] ?? "",
    comparableIds: propertyIds.slice(1),
    excludedIds: [],
  };
}

export function getIncludedPropertyIds(selection: ComparisonSelection): string[] {
  return [selection.subjectId, ...selection.comparableIds].filter(Boolean);
}

export function assignPropertyPosition(
  selection: ComparisonSelection,
  propertyId: string,
  targetPosition: number,
): ComparisonSelection {
  const propertyIds = getIncludedPropertyIds(selection);
  const currentPosition = propertyIds.indexOf(propertyId);
  if (
    currentPosition < 0
    || targetPosition < 0
    || targetPosition >= propertyIds.length
    || targetPosition === currentPosition
  ) {
    return selection;
  }

  [propertyIds[currentPosition], propertyIds[targetPosition]] = [propertyIds[targetPosition], propertyIds[currentPosition]];
  return {
    ...selection,
    subjectId: propertyIds[0],
    comparableIds: propertyIds.slice(1),
  };
}

export function changeSubject(selection: ComparisonSelection, nextSubjectId: string): ComparisonSelection {
  if (!nextSubjectId || nextSubjectId === selection.subjectId) return selection;

  if (selection.comparableIds.includes(nextSubjectId)) {
    return assignPropertyPosition(selection, nextSubjectId, 0);
  }

  return {
    subjectId: nextSubjectId,
    comparableIds: [selection.subjectId, ...selection.comparableIds.filter((id) => id !== nextSubjectId)].filter(Boolean),
    excludedIds: selection.excludedIds.filter((id) => id !== nextSubjectId),
  };
}

export function excludeComparable(selection: ComparisonSelection, comparableId: string): ComparisonSelection {
  if (!selection.comparableIds.includes(comparableId)) return selection;
  return {
    ...selection,
    comparableIds: selection.comparableIds.filter((id) => id !== comparableId),
    excludedIds: [...selection.excludedIds, comparableId],
  };
}

export function reinstateComparable(selection: ComparisonSelection, comparableId: string): ComparisonSelection {
  if (!selection.excludedIds.includes(comparableId)) return selection;
  return {
    ...selection,
    comparableIds: [...selection.comparableIds, comparableId],
    excludedIds: selection.excludedIds.filter((id) => id !== comparableId),
  };
}

export function moveComparable(selection: ComparisonSelection, comparableId: string, direction: -1 | 1): ComparisonSelection {
  const currentIndex = selection.comparableIds.indexOf(comparableId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selection.comparableIds.length) return selection;

  return assignPropertyPosition(selection, comparableId, nextIndex + 1);
}
