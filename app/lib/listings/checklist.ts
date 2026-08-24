import type { ListingMarketingTask, ListingPropertyType } from "../../data/listing-types";

export const LISTING_CHECKLIST_LEGACY_KEYS = ["description_fr", "description_en"] as const;
export const LISTING_CHECKLIST_STRUCTURAL_KEYS = ["documents"] as const;
export const LISTING_COMMON_DOCUMENT_KEYS = [
  "owner_deed",
  "owner_location_certificate",
  "owner_land_registry",
  "owner_mortgage_statement",
] as const;
export const LISTING_CONDO_INDIVISION_DOCUMENT_KEYS = [
  "condo_indivision_agreement",
  "condo_insurance",
  "condo_preemption_waiver",
] as const;
export const LISTING_CONDO_DIVIDED_DOCUMENT_KEYS = [
  "condo_declaration",
  "condo_insurance_policy",
  "condo_annual_general_meeting",
  "condo_minutes",
  "condo_financial_statements",
  "condo_budgets",
  "condo_reference_unit_description",
] as const;
export const LISTING_LAND_DOCUMENT_KEYS = [
  "land_survey_certificate",
  "land_ccg_recommended",
  "land_zoning_grid",
] as const;

const legacyKeys = new Set<string>(LISTING_CHECKLIST_LEGACY_KEYS);
const structuralKeys = new Set<string>(LISTING_CHECKLIST_STRUCTURAL_KEYS);
const commonDocumentKeys = new Set<string>(LISTING_COMMON_DOCUMENT_KEYS);
const condoIndivisionKeys = new Set<string>(LISTING_CONDO_INDIVISION_DOCUMENT_KEYS);
const condoDividedKeys = new Set<string>(LISTING_CONDO_DIVIDED_DOCUMENT_KEYS);
const condoDocumentKeys = new Set<string>([...LISTING_CONDO_INDIVISION_DOCUMENT_KEYS, ...LISTING_CONDO_DIVIDED_DOCUMENT_KEYS]);
const landDocumentKeys = new Set<string>(LISTING_LAND_DOCUMENT_KEYS);
const allDocumentKeys = new Set<string>([...LISTING_COMMON_DOCUMENT_KEYS, ...LISTING_CONDO_INDIVISION_DOCUMENT_KEYS, ...LISTING_CONDO_DIVIDED_DOCUMENT_KEYS, ...LISTING_LAND_DOCUMENT_KEYS]);

export type ListingChecklistTaskLike = Pick<ListingMarketingTask, "taskKey" | "isCustom" | "completed">;
export type ListingDocumentGroup<T> = { key: "base" | "condo_indivision" | "condo_divided" | "land"; title: string; tasks: T[] };

export function isListingChecklistLegacyTask(task: Pick<ListingChecklistTaskLike, "taskKey" | "isCustom">) {
  return !task.isCustom && Boolean(task.taskKey && legacyKeys.has(task.taskKey));
}

export function isListingChecklistStructuralTask(task: Pick<ListingChecklistTaskLike, "taskKey" | "isCustom">) {
  return !task.isCustom && Boolean(task.taskKey && structuralKeys.has(task.taskKey));
}

export function isListingDocumentTask(task: Pick<ListingChecklistTaskLike, "taskKey" | "isCustom">) {
  return !task.isCustom && Boolean(task.taskKey && allDocumentKeys.has(task.taskKey));
}

export function isListingTaskVisible(task: Pick<ListingChecklistTaskLike, "taskKey" | "isCustom">, propertyType: ListingPropertyType) {
  if (task.isCustom) return true;
  if (!task.taskKey || legacyKeys.has(task.taskKey)) return false;
  if (condoDocumentKeys.has(task.taskKey)) return propertyType === "condo";
  if (landDocumentKeys.has(task.taskKey)) return propertyType === "land";
  return true;
}

export function isListingTaskActionable(task: Pick<ListingChecklistTaskLike, "taskKey" | "isCustom">, propertyType: ListingPropertyType) {
  return isListingTaskVisible(task, propertyType) && !isListingChecklistStructuralTask(task);
}

export function getVisibleListingTasks<T extends ListingChecklistTaskLike>(tasks: readonly T[], propertyType: ListingPropertyType) {
  return tasks.filter((task) => isListingTaskActionable(task, propertyType));
}

export function getListingDocumentGroups<T extends ListingChecklistTaskLike>(tasks: readonly T[], propertyType: ListingPropertyType): ListingDocumentGroup<T>[] {
  const visible = getVisibleListingTasks(tasks, propertyType).filter(isListingDocumentTask);
  const groups: ListingDocumentGroup<T>[] = [{ key: "base", title: "DOCUMENTS DE BASE", tasks: visible.filter((task) => Boolean(task.taskKey && commonDocumentKeys.has(task.taskKey))) }];
  if (propertyType === "condo") {
    groups.push(
      { key: "condo_indivision", title: "COPROPRIÉTÉ INDIVISE", tasks: visible.filter((task) => Boolean(task.taskKey && condoIndivisionKeys.has(task.taskKey))) },
      { key: "condo_divided", title: "COPROPRIÉTÉ DIVISE", tasks: visible.filter((task) => Boolean(task.taskKey && condoDividedKeys.has(task.taskKey))) },
    );
  }
  if (propertyType === "land") groups.push({ key: "land", title: "TERRAIN", tasks: visible.filter((task) => Boolean(task.taskKey && landDocumentKeys.has(task.taskKey))) });
  return groups;
}

export function getListingChecklistStats<T extends ListingChecklistTaskLike>(tasks: readonly T[], propertyType: ListingPropertyType) {
  const visibleTasks = getVisibleListingTasks(tasks, propertyType);
  return { visibleTasks, completed: visibleTasks.filter((task) => task.completed).length, total: visibleTasks.length, remaining: visibleTasks.filter((task) => !task.completed).length };
}

export function listingTaskDisplayTitle(task: Pick<ListingMarketingTask, "title" | "taskKey">) {
  if (task.taskKey === "video_drone") return "DRONE";
  if (task.taskKey === "documents") return "DOCUMENTS DU PROPRIÉTAIRE";
  return task.title;
}
