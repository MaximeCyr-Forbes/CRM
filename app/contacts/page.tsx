"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { DataStatus } from "../components/data-status";
import { DuplicateResolutionModal } from "../components/duplicate-resolution-modal";
import { ImportContactReviewModal } from "../components/import-contact-review-modal";
import { ContactEmailModal } from "../components/contact-email-modal";
import { ContactBulkDeleteModal } from "../components/contact-bulk-delete-modal";
import { useContacts } from "../contacts-context";
import { useCRMData } from "../crm-data-context";
import { useBroker } from "../broker-context";
import {
  BROKER_LABELS,
  CLIENT_PROVENANCES,
  CLIENT_PROVENANCE_LABELS,
  CONTACT_ASSIGNMENTS,
  CONTACT_BROKERS,
  PRIORITY_LABELS,
  getContactName,
  type Contact,
  type ContactBroker,
  type ContactDraft,
  type ClientProvenance,
  type ContactAddressInput,
  type DraftMergeSelection,
} from "../data/contact-types";
import {
  analyzeImportDrafts,
  getBirthdayImportAction,
  analyzeCSVContacts,
  decodeContactImportBuffer,
  parseCSVContactsWithMapping,
  parseVCardContacts,
  updateCSVMapping,
  type CSVImportField,
  type CSVImportMapping,
  type ImportCandidate,
  type ImportCandidateStatus,
} from "../lib/contact-import";
import {
  findDuplicateMatches,
  getDuplicateReasons,
  hasMinimumContactIdentity,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  searchableContactText,
  type DuplicateReason,
} from "../lib/contact-normalization";
import { addressInputFromDraft, primaryAddressFields } from "../lib/contact-addresses";
import { formatFollowUpDate, toLocalISODate } from "../lib/follow-up";
import { deleteContactsSequentially, retainUnassignedContactSelection, toggleVisibleContactSelection } from "../lib/contacts/bulk-delete";
import {
  buildContactProfileHref,
  buildContactReturnTo,
  contactsListHref,
  getContactsPaginationItems,
  paginateContacts,
  parseContactsPage,
} from "../lib/contacts/list-pagination";

type ContactFilter = "all" | ContactBroker;
type ImportKind = "csv" | "vcard";
type ImportResolution = "keep" | "merge" | "enrich" | "skip" | "unresolved";
type ReviewFilter = "all" | ImportCandidateStatus;

type PendingImport = {
  candidates: ImportCandidate[];
  csvText: string | null;
  fileName: string;
  mapping: CSVImportMapping | null;
  mappingConfirmed: boolean;
  source: Exclude<ImportKind, null>;
  resolutions: Record<string, ImportResolution>;
  merges: Record<string, { targetId: string; values: DraftMergeSelection }>;
  addresses: Record<string, ContactAddressInput[]>;
};

type PendingManualDuplicate = {
  broker: (typeof CONTACT_BROKERS)[number];
  existing: Contact;
  reasons: DuplicateReason[];
};

const emptyDraft: ContactDraft = {
  firstName: "", lastName: "", phone: "", email: "", birthDate: "", mortgageRenewalDate: "",
  civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "",
};
const contactDraftLabels: Record<keyof ContactDraft, string> = {
  firstName: "Prénom", lastName: "Nom", phone: "Téléphone", email: "Email",
  birthDate: "Date de naissance",
  mortgageRenewalDate: "Date de renouvellement hypothécaire",
  civicNumber: "Numéro civique", address: "Rue", apartment: "Appartement", city: "Ville", province: "Province",
  postalCode: "Code postal", country: "Pays",
};
const filterOptions: ReadonlyArray<{ label: string; value: ContactFilter }> = [
  { label: "Tous", value: "all" },
  { label: "France", value: "france" },
  { label: "Maxime", value: "maxime" },
  { label: "Sandrine", value: "sandrine" },
  { label: "Non attribués", value: "unassigned" },
];
const RETURNED_CONTACT_HEADER_GAP = 12;

function scrollReturnedContactIntoView(target: HTMLElement) {
  const header = document.querySelector<HTMLElement>(".app-header");
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
  const targetTop = target.getBoundingClientRect().top;

  window.scrollTo({
    top: Math.max(0, window.scrollY + targetTop - headerBottom - RETURNED_CONTACT_HEADER_GAP),
    behavior: "auto",
  });
}
const reviewLabels: Record<ReviewFilter, string> = {
  all: "TOUS",
  new: "NOUVEAUX",
  duplicate: "DOUBLONS",
  incomplete: "INCOMPLETS",
};
const csvMappingLabels: Record<CSVImportField, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  fullName: "Nom complet",
  email: "Email",
  birthDate: "Date de naissance",
  phone: "Téléphone",
  civicNumber: "Numéro civique",
  address: "Rue",
  apartment: "Appartement",
  city: "Ville",
  province: "Province",
  postalCode: "Code postal",
  country: "Pays",
};
const csvMappingFields = Object.keys(csvMappingLabels) as CSVImportField[];

function syntheticContact(candidate: ImportCandidate, addressInputs?: ReadonlyArray<ContactAddressInput>): Contact {
  const address = addressInputFromDraft(candidate.draft);
  const now = new Date().toISOString();
  const addresses = addressInputs ?? (address ? [address] : []);
  return {
    id: candidate.id,
    ...candidate.draft,
    broker: "unassigned",
    clientType: null,
    clientProvenance: null,
    priority: null,
    status: "active",
    source: "csv",
    lastContactDate: null,
    nextFollowUpDate: null,
    googleCalendarEventId: null,
    googleCalendarEventBroker: null,
    googleCalendarSyncStatus: "synced",
    googleCalendarLastError: null,
    addresses: addresses.map((item, index) => ({ ...item, id: item.id ?? `import:${candidate.id}:${index}`, contactId: candidate.id, createdAt: now, updatedAt: now })),
    createdAt: now,
    updatedAt: now,
  };
}

function importClassificationKey(candidate: ImportCandidate) {
  return [
    candidate.status,
    candidate.duplicateDraftIndex ?? "",
    ...candidate.duplicateMatches.map((match) => match.contact.id).sort(),
  ].join("|");
}

function automaticImportResolution(candidate: ImportCandidate): ImportResolution {
  const birthday = getBirthdayImportAction(candidate);
  if (birthday.action === "enrich") return "enrich";
  if (birthday.action === "same") return "skip";
  if (birthday.action === "conflict") return "unresolved";
  if (candidate.status === "new") return "keep";
  return "unresolved";
}

export default function ContactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const {
    contacts,
    addManualContact,
    importContacts,
    enrichContactBirthDates,
    assignContact,
    deleteContact,
    mergeDraftIntoContact,
  } = useContacts();
  const { notes, loadNotesForContact, isLoading, isSaving } = useCRMData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const bulkDeleteLockRef = useRef(false);
  const contactsListRef = useRef<HTMLDivElement>(null);
  const pendingPageScrollRef = useRef(false);

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [manualStep, setManualStep] = useState<"closed" | "details" | "assignment">("closed");
  const [manualDraft, setManualDraft] = useState<ContactDraft>(emptyDraft);
  const [manualClientProvenance, setManualClientProvenance] = useState<ClientProvenance>(null);
  const [manualCreationKey, setManualCreationKey] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualDuplicate, setManualDuplicate] = useState<PendingManualDuplicate | null>(null);
  const [importKind, setImportKind] = useState<ImportKind | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [activeImportDuplicateId, setActiveImportDuplicateId] = useState<string | null>(null);
  const [reviewedImportId, setReviewedImportId] = useState<string | null>(null);
  const [assignmentTargetId, setAssignmentTargetId] = useState<string | null>(null);
  const [emailContactId, setEmailContactId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [highlightedContactId, setHighlightedContactId] = useState<string | null>(null);
  // TEMPORAIRE — outil de ménage initial des Contacts non attribués.
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ completed: number; total: number } | null>(null);
  const queryBroker = searchParams.get("broker");
  const queryFollowUp = searchParams.get("followUp");
  const querySearch = searchParams.get("q") ?? "";
  const currentQuery = searchParams.toString();
  const activeFilter = filterOptions.some((option) => option.value === queryBroker)
    ? queryBroker as ContactFilter
    : "all";
  const today = toLocalISODate(new Date());

  const normalizedTerms = [normalizeName(search), normalizePhone(search), normalizeEmail(search)].filter(Boolean);
  const visibleContacts = useMemo(
    () => [...contacts]
      .filter((contact) => activeFilter === "all" || contact.broker === activeFilter)
      .filter((contact) => queryFollowUp !== "overdue" || Boolean(contact.nextFollowUpDate && contact.nextFollowUpDate < today))
      .filter((contact) => normalizedTerms.length === 0 || normalizedTerms.some((term) => searchableContactText(contact).includes(term)))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    [activeFilter, contacts, normalizedTerms.join("|"), queryFollowUp, today],
  );
  const unassignedCount = contacts.filter((contact) => contact.broker === "unassigned").length;
  const pagination = paginateContacts(visibleContacts, parseContactsPage(searchParams.get("page")));
  const { contacts: pagedContacts, currentPage, pageStart, totalPages } = pagination;
  const pageEnd = Math.min(pageStart + pagedContacts.length, visibleContacts.length);
  const paginationItems = getContactsPaginationItems(currentPage, totalPages);
  const pagedContactIds = pagedContacts.map((contact) => contact.id);
  const selectedVisibleCount = pagedContactIds.filter((id) => selectedContactIds.has(id)).length;
  const areAllVisibleSelected = pagedContactIds.length > 0 && selectedVisibleCount === pagedContactIds.length;
  const selectedContacts = contacts.filter((contact) => contact.broker === "unassigned" && selectedContactIds.has(contact.id));
  const assignmentTarget = contacts.find((contact) => contact.id === assignmentTargetId);
  const emailContact = contacts.find((contact) => contact.id === emailContactId) ?? null;
  const activeImportCandidate = pendingImport?.candidates.find((candidate) => candidate.id === activeImportDuplicateId) ?? null;
  const batchExistingCandidate = activeImportCandidate?.duplicateDraftIndex !== null && activeImportCandidate?.duplicateDraftIndex !== undefined
    ? pendingImport?.candidates[activeImportCandidate.duplicateDraftIndex] ?? null
    : null;
  const activeImportExisting = activeImportCandidate?.duplicateMatches[0]?.contact ?? (batchExistingCandidate ? syntheticContact(batchExistingCandidate, pendingImport?.addresses[batchExistingCandidate.id]) : null);
  const activeImportReasons = activeImportCandidate && activeImportExisting
    ? getDuplicateReasons(activeImportCandidate.draft, activeImportExisting)
    : [];
  const reviewedImportIndex = pendingImport?.candidates.findIndex((candidate) => candidate.id === reviewedImportId) ?? -1;
  const reviewedImportCandidate = reviewedImportIndex >= 0 ? pendingImport?.candidates[reviewedImportIndex] ?? null : null;
  const reviewedBatchCandidate = reviewedImportCandidate?.duplicateDraftIndex !== null && reviewedImportCandidate?.duplicateDraftIndex !== undefined
    ? pendingImport?.candidates[reviewedImportCandidate.duplicateDraftIndex] ?? null
    : null;
  const reviewedImportExisting = reviewedImportCandidate?.duplicateMatches[0]?.contact ?? (reviewedBatchCandidate ? syntheticContact(reviewedBatchCandidate, pendingImport?.addresses[reviewedBatchCandidate.id]) : null);

  function changeContactFilter(filter: ContactFilter) {
    router.replace(contactsListHref(currentQuery, {
      broker: filter === "all" ? null : filter,
      page: "1",
    }), { scroll: false });
  }

  function changeContactSearch(value: string) {
    setSearch(value);
    router.replace(contactsListHref(currentQuery, {
      q: value || null,
      page: "1",
    }), { scroll: false });
  }

  function changeContactsPage(page: number) {
    const nextPage = Math.min(Math.max(1, page), totalPages);
    if (nextPage === currentPage) return;
    pendingPageScrollRef.current = true;
    router.push(contactsListHref(currentQuery, { page: String(nextPage) }), { scroll: false });
  }

  function openContact(contactId: string) {
    const returnTo = buildContactReturnTo(currentQuery, currentPage, contactId);
    window.history.replaceState(window.history.state, "", returnTo);
    router.push(buildContactProfileHref(contactId, returnTo));
  }

  function showConfirmation(message: string) {
    setConfirmation(message);
    window.setTimeout(() => setConfirmation(null), 4500);
  }

  function closeManualModal() {
    setManualStep("closed");
    setManualDraft(emptyDraft);
    setManualClientProvenance(null);
    setManualCreationKey(null);
    setManualError(null);
  }

  function openManualModal() {
    setManualCreationKey(crypto.randomUUID());
    setManualStep("details");
  }

  function submitManualDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasMinimumContactIdentity(manualDraft)) {
      setManualError("Ajoutez au minimum un nom, un téléphone ou un email.");
      return;
    }
    setManualError(null);
    setManualStep("assignment");
  }

  async function chooseManualBroker(broker: (typeof CONTACT_BROKERS)[number]) {
    const match = findDuplicateMatches(manualDraft, contacts)[0];
    if (match) {
      setManualDuplicate({ broker, existing: match.contact, reasons: match.reasons });
      await loadNotesForContact(match.contact.id);
      return;
    }
    await createManualContact(broker);
  }

  async function createManualContact(broker: (typeof CONTACT_BROKERS)[number]) {
    const creationKey = manualCreationKey ?? crypto.randomUUID();
    if (!manualCreationKey) setManualCreationKey(creationKey);
    const contact = await addManualContact(manualDraft, broker, {
      clientProvenance: manualClientProvenance,
      creationKey,
    });
    closeManualModal();
    setManualDuplicate(null);
    showConfirmation(`${getContactName(contact)} a été ajouté.`);
  }

  async function mergeManual(values: DraftMergeSelection) {
    if (!manualDuplicate) return;
    const merged = await mergeDraftIntoContact(manualDuplicate.existing.id, manualDraft, values);
    closeManualModal();
    setManualDuplicate(null);
    showConfirmation(`${getContactName(merged)} a été fusionné sans perdre son historique.`);
  }

  async function processImportFile(file: File) {
    if (!importKind) return;
    const expectedExtension = importKind === "csv" ? "csv" : "vcf";
    if (file.name.toLowerCase().split(".").pop() !== expectedExtension) {
      setImportError(`Veuillez sélectionner un fichier .${expectedExtension}.`);
      return;
    }
    try {
      const text = decodeContactImportBuffer(await file.arrayBuffer());
      const csvAnalysis = importKind === "csv" ? analyzeCSVContacts(text) : null;
      const drafts = csvAnalysis?.drafts ?? parseVCardContacts(text);
      if (drafts.length === 0) throw new Error("empty");
      const candidates = analyzeImportDrafts(drafts, contacts);
      setPendingImport({
        candidates,
        csvText: csvAnalysis ? text : null,
        fileName: file.name,
        mapping: csvAnalysis?.mapping ?? null,
        mappingConfirmed: !csvAnalysis?.mapping.requiresConfirmation,
        source: importKind,
        resolutions: Object.fromEntries(candidates.map((candidate) => [candidate.id, automaticImportResolution(candidate)])),
        merges: {},
        addresses: Object.fromEntries(candidates.map((candidate) => {
          const address = addressInputFromDraft(candidate.draft);
          return [candidate.id, address ? [address] : []];
        })),
      });
      setReviewFilter("all");
      setImportKind(null);
      setImportError(null);
    } catch {
      setImportError("Le fichier n’a pas pu être analysé. Vérifiez son format.");
    }
  }

  function remapCSVField(field: CSVImportField, value: string) {
    setImportError(null);
    setPendingImport((current) => {
      if (!current?.mapping || !current.csvText) return current;
      const mapping = updateCSVMapping(current.mapping, field, value === "" ? null : Number(value));
      const candidates = analyzeImportDrafts(parseCSVContactsWithMapping(current.csvText, mapping), contacts);
      return {
        ...current,
        candidates,
        mapping,
        mappingConfirmed: field === "birthDate" ? current.mappingConfirmed : false,
        resolutions: Object.fromEntries(candidates.map((candidate) => [candidate.id, automaticImportResolution(candidate)])),
        merges: {},
        addresses: Object.fromEntries(candidates.map((candidate) => {
          const address = addressInputFromDraft(candidate.draft);
          return [candidate.id, address ? [address] : []];
        })),
      };
    });
  }

  function updateImportCandidate(candidateId: string, draft: ContactDraft) {
    setPendingImport((current) => {
      if (!current) return null;
      const drafts = current.candidates.map((candidate) => candidate.id === candidateId ? draft : candidate.draft);
      const candidates = analyzeImportDrafts(drafts, contacts).map((candidate, index) => ({
        ...candidate,
        id: current.candidates[index].id,
      }));
      const resolutions = Object.fromEntries(candidates.map((candidate, index) => {
        const previous = current.candidates[index];
        const classificationChanged = importClassificationKey(candidate) !== importClassificationKey(previous);
        const resolution = candidate.id === candidateId || classificationChanged
          ? automaticImportResolution(candidate)
          : current.resolutions[candidate.id];
        return [candidate.id, resolution];
      }));
      const merges = Object.fromEntries(Object.entries(current.merges).filter(([id]) => {
        const index = candidates.findIndex((candidate) => candidate.id === id);
        return index >= 0
          && id !== candidateId
          && importClassificationKey(candidates[index]) === importClassificationKey(current.candidates[index]);
      }));
      return {
        ...current,
        candidates,
        resolutions,
        merges,
        addresses: {
          ...current.addresses,
          [candidateId]: (() => {
            const address = addressInputFromDraft(draft);
            return address ? [address] : [];
          })(),
        },
      };
    });
  }

  function resolveImport(candidateId: string, resolution: ImportResolution) {
    setPendingImport((current) => current ? { ...current, resolutions: { ...current.resolutions, [candidateId]: resolution } } : null);
  }

  function openImportDuplicate(candidate: ImportCandidate) {
    const existing = candidate.duplicateMatches[0]?.contact;
    if (existing) void loadNotesForContact(existing.id);
    setActiveImportDuplicateId(candidate.id);
  }

  async function mergeImport(values: DraftMergeSelection) {
    if (!pendingImport || !activeImportCandidate || !activeImportExisting) return;
    if (activeImportCandidate.duplicateMatches.length > 0) {
      setPendingImport((current) => current ? {
        ...current,
        merges: {
          ...current.merges,
          [activeImportCandidate.id]: { targetId: activeImportExisting.id, values },
        },
      } : null);
    } else if (batchExistingCandidate) {
      setPendingImport((current) => {
        if (!current) return current;
        const candidates = current.candidates.map((candidate) => candidate.id === batchExistingCandidate.id ? {
          ...candidate,
          draft: {
            ...candidate.draft,
            ...Object.fromEntries((Object.keys(contactDraftLabels) as Array<keyof ContactDraft>).map((field) => [field, values[field]])),
            ...primaryAddressFields(values.addresses ?? []),
          },
        } : candidate);
        return {
          ...current,
          candidates,
          addresses: { ...current.addresses, [batchExistingCandidate.id]: values.addresses ?? current.addresses[batchExistingCandidate.id] ?? [] },
          resolutions: { ...current.resolutions, [batchExistingCandidate.id]: "keep", [activeImportCandidate.id]: "merge" },
        };
      });
    }
    resolveImport(activeImportCandidate.id, "merge");
    setActiveImportDuplicateId(null);
  }

  async function finishImport() {
    if (!pendingImport) return;
    if (!pendingImport.mappingConfirmed) {
      setImportError("Confirmez le mapping détecté avant de terminer l’import.");
      return;
    }
    const unresolved = pendingImport.candidates.some((candidate) => pendingImport.resolutions[candidate.id] === "unresolved");
    if (unresolved) {
      setImportError("Résolvez chaque doublon et chaque contact incomplet avant de terminer.");
      return;
    }
    const entriesToInsert = pendingImport.candidates
      .filter((candidate) => pendingImport.resolutions[candidate.id] === "keep")
      .filter((candidate) => hasMinimumContactIdentity(candidate.draft))
      .map((candidate) => ({ draft: candidate.draft, addresses: pendingImport.addresses[candidate.id] ?? [] }));
    const enrichments = pendingImport.candidates.flatMap((candidate) => {
      if (pendingImport.resolutions[candidate.id] !== "enrich") return [];
      const birthday = getBirthdayImportAction(candidate);
      return birthday.action === "enrich" && birthday.contact
        ? [{ contactId: birthday.contact.id, birthDate: candidate.draft.birthDate }]
        : [];
    });
    await enrichContactBirthDates(enrichments);
    for (const candidate of pendingImport.candidates) {
      const merge = pendingImport.merges[candidate.id];
      if (pendingImport.resolutions[candidate.id] === "merge" && merge) {
        await mergeDraftIntoContact(merge.targetId, candidate.draft, merge.values);
      }
    }
    const imported = entriesToInsert.length > 0 ? await importContacts(entriesToInsert, pendingImport.source) : [];
    setPendingImport(null);
    setImportError(null);
    const birthdays = pendingImport.candidates.filter((candidate) => candidate.draft.birthDate && pendingImport.resolutions[candidate.id] !== "skip").length;
    showConfirmation(`${imported.length} nouveau${imported.length > 1 ? "x" : ""} contact${imported.length > 1 ? "s" : ""} importé${imported.length > 1 ? "s" : ""}.${birthdays ? ` ${birthdays} anniversaire${birthdays > 1 ? "s" : ""} en synchronisation.` : ""}`);
  }

  async function reassignContact(contact: Contact, broker: ContactBroker) {
    await assignContact(contact.id, broker);
    setAssignmentTargetId(null);
    showConfirmation(`${getContactName(contact)} · ${BROKER_LABELS[broker]}`);
  }

  function toggleContactSelection(contactId: string) {
    if (isBulkDeleting) return;
    setSelectedContactIds((current) => {
      const next = new Set(current);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  function clearContactSelection() {
    if (!isBulkDeleting) setSelectedContactIds(new Set());
  }

  async function confirmBulkDelete() {
    if (bulkDeleteLockRef.current || isBulkDeleting) return;
    const contactIds = selectedContacts.map((contact) => contact.id);
    if (contactIds.length === 0) {
      setIsBulkDeleteModalOpen(false);
      return;
    }

    bulkDeleteLockRef.current = true;
    setIsBulkDeleting(true);
    setBulkDeleteProgress({ completed: 0, total: contactIds.length });
    let completed = 0;

    try {
      const result = await deleteContactsSequentially(contactIds, async (contactId) => {
        try {
          await deleteContact(contactId);
        } finally {
          completed += 1;
          setBulkDeleteProgress({ completed, total: contactIds.length });
        }
      }, (contactId) => {
        setSelectedContactIds((current) => {
          const next = new Set(current);
          next.delete(contactId);
          return next;
        });
      });

      setSelectedContactIds(new Set(result.failedIds));
      setIsBulkDeleteModalOpen(false);
      if (result.failedIds.length === 0) {
        showConfirmation(`${result.deletedIds.length} Contact${result.deletedIds.length > 1 ? "s" : ""} supprimé${result.deletedIds.length > 1 ? "s" : ""}.`);
      } else {
        showConfirmation(`${result.deletedIds.length} Contact${result.deletedIds.length > 1 ? "s" : ""} supprimé${result.deletedIds.length > 1 ? "s" : ""}. ${result.failedIds.length} Contact${result.failedIds.length > 1 ? "s" : ""} n’${result.failedIds.length > 1 ? "ont" : "a"} pas pu être supprimé${result.failedIds.length > 1 ? "s" : ""}.`);
      }
    } finally {
      bulkDeleteLockRef.current = false;
      setIsBulkDeleting(false);
      setBulkDeleteProgress(null);
    }
  }

  const reviewCounts = pendingImport ? {
    all: pendingImport.candidates.length,
    new: pendingImport.candidates.filter((candidate) => candidate.status === "new").length,
    duplicate: pendingImport.candidates.filter((candidate) => candidate.status === "duplicate").length,
    incomplete: pendingImport.candidates.filter((candidate) => candidate.status === "incomplete").length,
  } : { all: 0, new: 0, duplicate: 0, incomplete: 0 };
  const reviewCandidates = pendingImport?.candidates.filter((candidate) => reviewFilter === "all" || candidate.status === reviewFilter) ?? [];
  const mappingWasAdjusted = pendingImport?.mapping
    ? csvMappingFields.some((field) => pendingImport.mapping?.[field]?.source === "manual")
    : false;

  useEffect(() => {
    setSearch(querySearch);
  }, [querySearch]);

  useEffect(() => {
    if (isLoading || search !== querySearch || searchParams.get("page") === String(currentPage)) return;
    router.replace(contactsListHref(currentQuery, { page: String(currentPage) }), { scroll: false });
  }, [currentPage, currentQuery, isLoading, querySearch, router, search, searchParams]);

  useEffect(() => {
    if (!pendingPageScrollRef.current) return;
    pendingPageScrollRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      contactsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentPage]);

  useEffect(() => {
    if (isLoading || pagedContacts.length === 0 || !window.location.hash.startsWith("#contact-")) return;
    let contactId = "";
    try {
      contactId = decodeURIComponent(window.location.hash.slice("#contact-".length));
    } catch {
      return;
    }
    const target = document.getElementById(`contact-${contactId}`);
    if (!target) return;

    let highlightTimeout: number | undefined;
    let layoutFrame: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      layoutFrame = window.requestAnimationFrame(() => {
        scrollReturnedContactIntoView(target);
        setHighlightedContactId(contactId);
        highlightTimeout = window.setTimeout(() => setHighlightedContactId(null), 1800);
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (layoutFrame !== undefined) window.cancelAnimationFrame(layoutFrame);
      if (highlightTimeout !== undefined) window.clearTimeout(highlightTimeout);
    };
  }, [currentPage, isLoading, pagedContacts.map((contact) => contact.id).join("|")]);

  useEffect(() => {
    if (activeFilter !== "unassigned") setSelectedContactIds(new Set());
  }, [activeFilter]);

  useEffect(() => {
    setSelectedContactIds((current) => retainUnassignedContactSelection(current, contacts));
  }, [contacts]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = selectedVisibleCount > 0 && !areAllVisibleSelected;
    }
  }, [areAllVisibleSelected, selectedVisibleCount]);

  return (
    <main className="contacts-page">
      <div className="contacts-shell">
        <DataStatus />
        <header className="contacts-header">
          <div><p className="section-kicker">Répertoire de l’équipe</p><h1>CONTACTS</h1><p>{contacts.length} contacts sauvegardés dans le CRM.</p></div>
          <div className="contacts-main-actions">
            <button className="contact-action contact-action-primary" disabled={isSaving} onClick={openManualModal} type="button">Ajouter un contact</button>
            <button className="contact-action" disabled={isSaving} onClick={() => setImportKind("csv")} type="button">Importer CSV</button>
            <button className="contact-action" disabled={isSaving} onClick={() => setImportKind("vcard")} type="button">Importer vCard</button>
          </div>
        </header>
        {unassignedCount > 0 && <button className="unassigned-alert" onClick={() => changeContactFilter("unassigned")} type="button"><span className="unassigned-alert-count">{unassignedCount}</span><span><strong>NON ATTRIBUÉS</strong><small>{unassignedCount} contact{unassignedCount > 1 ? "s" : ""} à classer</small></span><span aria-hidden="true">→</span></button>}
        <section className="contacts-directory">
          <div className="contacts-tools">
            <div className="contact-filters">{filterOptions.map((option) => <button aria-pressed={activeFilter === option.value} className={activeFilter === option.value ? "contact-filter-active" : ""} key={option.value} onClick={() => changeContactFilter(option.value)} type="button">{option.label} <span>{option.value === "all" ? contacts.length : contacts.filter((contact) => contact.broker === option.value).length}</span></button>)}</div>
            <label className="contacts-search"><span className="sr-only">Rechercher</span><span aria-hidden="true">⌕</span><input onChange={(event) => changeContactSearch(event.target.value)} placeholder="Nom, téléphone, email ou adresse" type="search" value={search} /></label>
          </div>
          {activeFilter === "unassigned" && <div className={`contacts-bulk-actions${selectedContactIds.size > 0 ? " contacts-bulk-actions-active" : ""}`}>
            <label className="contacts-select-all"><input aria-label="Sélectionner tous les contacts visibles" checked={areAllVisibleSelected} disabled={isBulkDeleting || pagedContacts.length === 0} onChange={() => setSelectedContactIds((current) => toggleVisibleContactSelection(current, pagedContactIds))} ref={selectAllCheckboxRef} type="checkbox" /><span>Tout sélectionner</span></label>
            {selectedContactIds.size > 0 && <div className="contacts-selection-summary"><strong>{selectedContactIds.size} CONTACT{selectedContactIds.size > 1 ? "S" : ""} SÉLECTIONNÉ{selectedContactIds.size > 1 ? "S" : ""}</strong><div><button disabled={isBulkDeleting} onClick={clearContactSelection} type="button">Annuler la sélection</button><button className="destructive-button" disabled={isBulkDeleting} onClick={() => setIsBulkDeleteModalOpen(true)} type="button">{isBulkDeleting ? "Suppression…" : "Supprimer"}</button></div></div>}
          </div>}
          <div className="contacts-list" ref={contactsListRef}>
            <div className="contacts-list-head" aria-hidden="true"><span>Contact</span><span>Coordonnées</span><span>Courtier</span><span>Suivi</span><span>Actions</span></div>
            {pagedContacts.map((contact) => <article className={`contact-row${selectedContactIds.has(contact.id) ? " contact-row-selected" : ""}${highlightedContactId === contact.id ? " contact-row-return-highlight" : ""}`} id={`contact-${contact.id}`} key={contact.id}>
              <div className="contact-main-cell">{activeFilter === "unassigned" && <label className="contact-select-control" onClick={(event) => event.stopPropagation()}><input aria-label={`Sélectionner ${getContactName(contact)}`} checked={selectedContactIds.has(contact.id)} disabled={isBulkDeleting} onChange={() => toggleContactSelection(contact.id)} type="checkbox" /><span className="sr-only">Sélectionner {getContactName(contact)}</span></label>}<span className="contact-initials" aria-hidden="true">{[contact.firstName, contact.lastName].filter(Boolean).map((part) => part[0]).slice(0, 2).join("") || "?"}</span><div><h2><button aria-label={`Ouvrir la fiche de ${getContactName(contact)}`} className="contact-name-button" onClick={() => openContact(contact.id)} type="button">{getContactName(contact)}</button></h2><small>{contact.priority ? `Priorité · ${PRIORITY_LABELS[contact.priority]}` : "Priorité non définie"}</small></div></div>
              <div className="contact-coordinates">{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <span>Téléphone non renseigné</span>}{contact.email ? <button aria-label={`Envoyer un courriel à ${getContactName(contact)}`} className="contact-email-link" onClick={() => setEmailContactId(contact.id)} type="button">{contact.email}</button> : <span>Email non renseigné</span>}</div>
              <span className={`contact-broker-badge broker-${contact.broker}`}>{BROKER_LABELS[contact.broker]}</span><span className="contact-follow-up-cell">{contact.nextFollowUpDate ? formatFollowUpDate(contact.nextFollowUpDate) : "Aucune relance"}</span>
              <div className="contact-row-actions"><button onClick={() => openContact(contact.id)} type="button">Ouvrir</button><button onClick={() => setAssignmentTargetId(contact.id)} type="button">Changer le courtier</button></div>
            </article>)}
            {!isLoading && visibleContacts.length === 0 && <div className="contacts-empty"><span aria-hidden="true">○</span><h2>Aucun contact trouvé</h2><p>Modifiez le filtre ou la recherche.</p></div>}
          </div>
          {visibleContacts.length > 0 && <nav aria-label="Pagination des contacts" className="contacts-pagination">
            <p>Contacts {pageStart + 1}–{pageEnd} sur {visibleContacts.length}</p>
            <div>
              <button aria-label="Page précédente" disabled={currentPage === 1} onClick={() => changeContactsPage(currentPage - 1)} type="button">← PRÉCÉDENT</button>
              <span className="contacts-pagination-mobile">Page {currentPage} / {totalPages}</span>
              <span className="contacts-pagination-pages">{paginationItems.map((item) => typeof item === "number"
                ? <button aria-current={item === currentPage ? "page" : undefined} aria-label={`Page ${item}`} className={item === currentPage ? "is-current" : ""} key={item} onClick={() => changeContactsPage(item)} type="button">{item}</button>
                : <span aria-hidden="true" key={item}>…</span>)}</span>
              <button aria-label="Page suivante" disabled={currentPage === totalPages} onClick={() => changeContactsPage(currentPage + 1)} type="button">SUIVANT →</button>
            </div>
          </nav>}
        </section>
      </div>

      {isBulkDeleteModalOpen && selectedContacts.length > 0 && <ContactBulkDeleteModal contacts={selectedContacts} isDeleting={isBulkDeleting} onClose={() => { if (!isBulkDeleting) setIsBulkDeleteModalOpen(false); }} onConfirm={() => void confirmBulkDelete()} progress={bulkDeleteProgress} />}

      {manualStep !== "closed" && <div className="contact-modal-backdrop"><section aria-modal="true" className="contact-modal contact-modal-medium" role="dialog">
        <header className="contact-modal-header"><div><p className="section-kicker">{manualStep === "details" ? "Nouveau contact" : "Attribution obligatoire"}</p><h2>{manualStep === "details" ? "Ajouter un contact" : "À QUI ATTRIBUER CE CONTACT ?"}</h2></div><button aria-label="Fermer" onClick={closeManualModal} type="button">×</button></header>
        {manualStep === "details" ? <form className="manual-contact-form" onSubmit={submitManualDetails}>
          {(Object.keys(contactDraftLabels) as Array<keyof ContactDraft>).map((field) => <label key={field}><span>{contactDraftLabels[field]}</span><input onChange={(event) => setManualDraft((current) => ({ ...current, [field]: event.target.value }))} type={field === "email" ? "email" : field === "phone" ? "tel" : field === "birthDate" || field === "mortgageRenewalDate" ? "date" : "text"} value={manualDraft[field]} /></label>)}
          <label><span>Provenance du client</span><select onChange={(event) => setManualClientProvenance(event.target.value === "" ? null : event.target.value as ClientProvenance)} value={manualClientProvenance ?? ""}><option value="">Non renseignée</option>{CLIENT_PROVENANCES.map((provenance) => <option key={provenance} value={provenance}>{CLIENT_PROVENANCE_LABELS[provenance]}</option>)}</select></label>
          {manualError && <p className="import-error">{manualError}</p>}<button className="manual-contact-continue" type="submit">Continuer vers l’attribution</button>
        </form> : <div className="broker-choice-grid">{CONTACT_BROKERS.map((broker) => <button disabled={isSaving} key={broker} onClick={() => void chooseManualBroker(broker)} type="button"><span>{BROKER_LABELS[broker]}</span><span aria-hidden="true">→</span></button>)}</div>}
      </section></div>}

      {importKind && <div className="contact-modal-backdrop"><section aria-modal="true" className="contact-modal contact-modal-medium" role="dialog">
        <header className="contact-modal-header"><div><p className="section-kicker">Analyse avant insertion</p><h2>Importer {importKind === "csv" ? "un CSV" : "une vCard"}</h2></div><button aria-label="Fermer" onClick={() => setImportKind(null)} type="button">×</button></header>
        <div className={`import-drop-zone ${isDragging ? "import-drop-zone-active" : ""}`} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files[0]; if (file) void processImportFile(file); }}>
          <span className="import-file-mark">{importKind === "csv" ? "CSV" : "VCF"}</span><h3>Déposez votre fichier ici</h3><p>Aucun contact ne sera inséré avant votre validation.</p><button onClick={() => fileInputRef.current?.click()} type="button">Sélectionner un fichier</button><input accept={importKind === "csv" ? ".csv,text/csv" : ".vcf,text/vcard"} className="sr-only" onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) void processImportFile(file); event.target.value = ""; }} ref={fileInputRef} type="file" />
        </div>{importError && <p className="import-error">{importError}</p>}
      </section></div>}

      {pendingImport && <div className="import-review-layer"><section className="import-review-shell">
        <header className="import-review-header"><div><p className="section-kicker">{pendingImport.fileName}</p><h2>{reviewCounts.all} CONTACTS DÉTECTÉS</h2><p>{reviewCounts.new} nouveaux · {reviewCounts.duplicate} doublons possibles · {reviewCounts.incomplete} incomplets</p></div><div className="import-review-header-actions"><button onClick={() => setPendingImport(null)} type="button">ANNULER</button><button className="finish-import" disabled={isSaving} onClick={() => void finishImport()} type="button">TERMINER L’IMPORT</button></div></header>
        {pendingImport.mapping && pendingImport.mappingConfirmed && <details className="import-mapping-auto">
          <summary><strong>{mappingWasAdjusted ? "Structure du fichier ajustée ✓" : "Structure du fichier détectée automatiquement ✓"}</strong><span>Voir le mapping détecté</span></summary>
          <div className="import-mapping-details"><div className="import-mapping-heading"><span>{pendingImport.mapping.hasHeader ? "Ligne d’en-tête reconnue" : "Fichier sans en-tête · première ligne conservée"}</span><small>Profil : {pendingImport.mapping.signature}</small></div><dl className="import-mapping-grid">
              {csvMappingFields.map((field) => {
                const match = pendingImport.mapping?.[field];
                if (!match && field === "fullName") return null;
                const alternatives = field === "phone" ? pendingImport.mapping?.phoneFallbacks.length ?? 0 : 0;
                return <div key={field}><dt>{csvMappingLabels[field]}</dt><dd>{field === "birthDate" ? <select aria-label="Colonne de date de naissance" onChange={(event) => remapCSVField(field, event.target.value)} value={match?.index ?? ""}><option value="">Non détecté</option>{pendingImport.mapping?.columns.map((column) => <option key={column.index} value={column.index}>{column.label}{column.example ? ` · ${column.example}` : ""}</option>)}</select> : match ? `${match.label} · ${Math.round(match.confidence * 100)} %${alternatives > 0 ? ` + ${alternatives} secours` : ""}` : "Non détecté"}</dd></div>;
              })}
            </dl></div>
        </details>}
        {pendingImport.mapping && !pendingImport.mappingConfirmed && <section className="import-mapping-summary import-mapping-needs-confirmation">
          <div className="import-mapping-heading"><div><strong>Une information essentielle doit être confirmée</strong><span>Vérifiez seulement le ou les champs ci-dessous.</span></div></div>
          <div className="import-mapping-confirmation">
            <p>{pendingImport.mapping.confirmationFields.length === 1 && pendingImport.mapping.confirmationFields[0] === "lastName" ? "Nous ne savons pas quelle colonne contient le nom." : pendingImport.mapping.confirmationFields.some((field) => field === "firstName" || field === "lastName" || field === "fullName") ? "Nous ne savons pas distinguer avec certitude le prénom et le nom." : "Deux sources d’identité semblent également probables."}</p>
            <div className="import-mapping-selects">{pendingImport.mapping.confirmationFields.map((field) => <label key={field}><span>{csvMappingLabels[field]}</span><select onChange={(event) => remapCSVField(field, event.target.value)} value={pendingImport.mapping?.[field]?.index ?? ""}><option value="">Non attribué</option>{pendingImport.mapping?.columns.map((column) => <option key={column.index} value={column.index}>{column.example || (pendingImport.mapping?.hasHeader ? column.label : "Champ disponible")}</option>)}</select></label>)}</div>
            <button onClick={() => { setImportError(null); setPendingImport((current) => current ? { ...current, mappingConfirmed: true } : null); }} type="button">CONFIRMER</button>
          </div>
        </section>}
        <div className="import-review-filters">{(Object.keys(reviewLabels) as ReviewFilter[]).map((filter) => <button className={reviewFilter === filter ? "contact-filter-active" : ""} key={filter} onClick={() => setReviewFilter(filter)} type="button">{reviewLabels[filter]} <span>{reviewCounts[filter]}</span></button>)}</div>
        {importError && <p className="import-error">{importError}</p>}
        <div className="imported-contacts-list">{reviewCandidates.map((candidate) => {
          const resolution = pendingImport.resolutions[candidate.id];
          return <article className="imported-contact-row import-quality-row" key={candidate.id}>
            <div className="imported-contact-identity"><h3><button className="import-contact-name-button" onClick={() => setReviewedImportId(candidate.id)} type="button">{getContactName(candidate.draft)}</button></h3><span>{candidate.draft.phone || "Sans téléphone"}</span><span>{candidate.draft.email || "Sans email"}</span><span>{candidate.draft.city || candidate.draft.postalCode || "Adresse non renseignée"}</span><strong className={candidate.status === "duplicate" ? "duplicate-warning" : candidate.status === "incomplete" ? "incomplete-warning" : "new-contact-status"}>{candidate.status === "duplicate" ? "DOUBLON POSSIBLE" : candidate.status === "incomplete" ? "CONTACT INCOMPLET" : "NOUVEAU"}</strong></div>
            {candidate.status === "incomplete" && resolution === "unresolved" && <div className="incomplete-editor"><input onChange={(event) => updateImportCandidate(candidate.id, { ...candidate.draft, firstName: event.target.value })} placeholder="Nom ou prénom" value={candidate.draft.firstName} /><input onChange={(event) => updateImportCandidate(candidate.id, { ...candidate.draft, phone: event.target.value })} placeholder="Téléphone" value={candidate.draft.phone} /><input onChange={(event) => updateImportCandidate(candidate.id, { ...candidate.draft, email: event.target.value })} placeholder="Email" value={candidate.draft.email} /></div>}
            <div className="import-quality-actions">
              {candidate.status === "duplicate" && resolution === "unresolved" && <><button onClick={() => openImportDuplicate(candidate)} type="button">RÉSOUDRE</button><button onClick={() => resolveImport(candidate.id, "skip")} type="button">IGNORER</button></>}
              {candidate.status === "incomplete" && resolution === "unresolved" && <><button disabled={!hasMinimumContactIdentity(candidate.draft)} onClick={() => resolveImport(candidate.id, "keep")} type="button">VALIDER</button><button onClick={() => resolveImport(candidate.id, "skip")} type="button">IGNORER</button></>}
              {resolution !== "unresolved" && <span className="import-resolution">{resolution === "keep" ? "Sera importé ✓" : resolution === "merge" ? "Fusionné ✓" : resolution === "enrich" ? "Date ajoutée au contact existant ✓" : "Ignoré"}</span>}
            </div>
          </article>;
        })}</div>
      </section></div>}

      {manualDuplicate && <DuplicateResolutionModal existing={manualDuplicate.existing} existingNotesCount={notes.filter((note) => note.contactId === manualDuplicate.existing.id).length} incoming={{ ...manualDraft, broker: manualDuplicate.broker, clientProvenance: manualClientProvenance }} isSaving={isSaving} onCancel={() => { setManualDuplicate(null); setManualStep("details"); }} onKeepBoth={() => createManualContact(manualDuplicate.broker)} onMerge={mergeManual} reasons={manualDuplicate.reasons} />}
      {reviewedImportCandidate && pendingImport && <ImportContactReviewModal candidate={reviewedImportCandidate} existing={reviewedImportExisting} mapping={pendingImport.mapping} onClose={() => setReviewedImportId(null)} onNext={reviewedImportIndex < pendingImport.candidates.length - 1 ? () => setReviewedImportId(pendingImport.candidates[reviewedImportIndex + 1].id) : undefined} onPrevious={reviewedImportIndex > 0 ? () => setReviewedImportId(pendingImport.candidates[reviewedImportIndex - 1].id) : undefined} onSave={(draft) => updateImportCandidate(reviewedImportCandidate.id, draft)} position={reviewedImportIndex} source={pendingImport.source} total={pendingImport.candidates.length} />}
      {activeImportCandidate && activeImportExisting && <DuplicateResolutionModal existing={activeImportExisting} existingNotesCount={notes.filter((note) => note.contactId === activeImportExisting.id).length} incoming={{ ...activeImportCandidate.draft, broker: "unassigned", clientProvenance: null }} isSaving={isSaving} onCancel={() => { resolveImport(activeImportCandidate.id, "skip"); setActiveImportDuplicateId(null); }} onKeepBoth={() => { resolveImport(activeImportCandidate.id, "keep"); setActiveImportDuplicateId(null); }} onMerge={mergeImport} reasons={activeImportReasons} />}

      {assignmentTarget && <div className="contact-modal-backdrop contact-modal-top"><section aria-modal="true" className="contact-modal contact-modal-medium" role="dialog"><header className="contact-modal-header"><div><p className="section-kicker">{getContactName(assignmentTarget)}</p><h2>À QUI ATTRIBUER CE CONTACT ?</h2></div><button aria-label="Fermer" onClick={() => setAssignmentTargetId(null)} type="button">×</button></header><div className="broker-choice-grid">{CONTACT_ASSIGNMENTS.map((broker) => <button className={assignmentTarget.broker === broker ? "broker-choice-current" : ""} key={broker} onClick={() => void reassignContact(assignmentTarget, broker)} type="button"><span>{BROKER_LABELS[broker]}</span><span>{assignmentTarget.broker === broker ? "✓" : "→"}</span></button>)}</div></section></div>}
      {emailContact && (
        <ContactEmailModal
          contactId={emailContact.id}
          contactName={getContactName(emailContact)}
          initialTo={emailContact.email}
          isOpen
          onChooseBroker={() => router.push("/")}
          onClose={() => setEmailContactId(null)}
          onSent={(broker) => {
            setEmailContactId(null);
            showConfirmation(`Courriel envoyé par ${broker}.`);
          }}
          selectedBroker={selectedBroker}
        />
      )}
      {confirmation && <div aria-live="polite" className="follow-up-confirmation" role="status"><span>✓</span><strong>{confirmation}</strong></div>}
    </main>
  );
}
