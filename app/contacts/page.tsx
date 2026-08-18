"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { DataStatus } from "../components/data-status";
import { DuplicateResolutionModal } from "../components/duplicate-resolution-modal";
import { ImportContactReviewModal } from "../components/import-contact-review-modal";
import { useContacts } from "../contacts-context";
import { useCRMData } from "../crm-data-context";
import {
  BROKER_LABELS,
  CONTACT_ASSIGNMENTS,
  CONTACT_BROKERS,
  PRIORITY_LABELS,
  getContactName,
  type Contact,
  type ContactBroker,
  type ContactDraft,
  type DraftMergeSelection,
} from "../data/contact-types";
import {
  analyzeImportDrafts,
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
import { formatFollowUpDate } from "../lib/follow-up";

type ContactFilter = "all" | ContactBroker;
type ImportKind = "csv" | "vcard";
type ImportResolution = "keep" | "merge" | "skip" | "unresolved";
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
};

type PendingManualDuplicate = {
  broker: (typeof CONTACT_BROKERS)[number];
  existing: Contact;
  reasons: DuplicateReason[];
};

const emptyDraft: ContactDraft = {
  firstName: "", lastName: "", phone: "", email: "",
  address: "", apartment: "", city: "", province: "", postalCode: "", country: "",
};
const contactDraftLabels: Record<keyof ContactDraft, string> = {
  firstName: "Prénom", lastName: "Nom", phone: "Téléphone", email: "Email",
  address: "Adresse", apartment: "Appartement", city: "Ville", province: "Province",
  postalCode: "Code postal", country: "Pays",
};
const filterOptions: ReadonlyArray<{ label: string; value: ContactFilter }> = [
  { label: "Tous", value: "all" },
  { label: "France", value: "france" },
  { label: "Maxime", value: "maxime" },
  { label: "Sandrine", value: "sandrine" },
  { label: "Non attribués", value: "unassigned" },
];
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
  phone: "Téléphone",
  address: "Adresse",
  apartment: "Appartement",
  city: "Ville",
  province: "Province",
  postalCode: "Code postal",
  country: "Pays",
};
const csvMappingFields = Object.keys(csvMappingLabels) as CSVImportField[];

function syntheticContact(candidate: ImportCandidate): Contact {
  return {
    id: candidate.id,
    ...candidate.draft,
    broker: "unassigned",
    clientType: null,
    priority: null,
    status: "active",
    source: "csv",
    lastContactDate: null,
    nextFollowUpDate: null,
    googleCalendarEventId: null,
    googleCalendarEventBroker: null,
    googleCalendarSyncStatus: "synced",
    googleCalendarLastError: null,
    buyerPipelineStage: "new",
    sellerPipelineStage: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function importClassificationKey(candidate: ImportCandidate) {
  return [
    candidate.status,
    candidate.duplicateDraftIndex ?? "",
    ...candidate.duplicateMatches.map((match) => match.contact.id).sort(),
  ].join("|");
}

export default function ContactsPage() {
  const router = useRouter();
  const {
    contacts,
    addManualContact,
    importContacts,
    assignContact,
    mergeDraftIntoContact,
  } = useContacts();
  const { notes, loadNotesForContact, isLoading, isSaving } = useCRMData();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeFilter, setActiveFilter] = useState<ContactFilter>("all");
  const [search, setSearch] = useState("");
  const [manualStep, setManualStep] = useState<"closed" | "details" | "assignment">("closed");
  const [manualDraft, setManualDraft] = useState<ContactDraft>(emptyDraft);
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
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(100);

  const normalizedTerms = [normalizeName(search), normalizePhone(search), normalizeEmail(search)].filter(Boolean);
  const visibleContacts = useMemo(
    () => [...contacts]
      .filter((contact) => activeFilter === "all" || contact.broker === activeFilter)
      .filter((contact) => normalizedTerms.length === 0 || normalizedTerms.some((term) => searchableContactText(contact).includes(term)))
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
    [activeFilter, contacts, normalizedTerms.join("|")],
  );
  const unassignedCount = contacts.filter((contact) => contact.broker === "unassigned").length;
  const pagedContacts = visibleContacts.slice(0, visibleLimit);
  const assignmentTarget = contacts.find((contact) => contact.id === assignmentTargetId);
  const activeImportCandidate = pendingImport?.candidates.find((candidate) => candidate.id === activeImportDuplicateId) ?? null;
  const batchExistingCandidate = activeImportCandidate?.duplicateDraftIndex !== null && activeImportCandidate?.duplicateDraftIndex !== undefined
    ? pendingImport?.candidates[activeImportCandidate.duplicateDraftIndex] ?? null
    : null;
  const activeImportExisting = activeImportCandidate?.duplicateMatches[0]?.contact ?? (batchExistingCandidate ? syntheticContact(batchExistingCandidate) : null);
  const activeImportReasons = activeImportCandidate && activeImportExisting
    ? getDuplicateReasons(activeImportCandidate.draft, activeImportExisting)
    : [];
  const reviewedImportIndex = pendingImport?.candidates.findIndex((candidate) => candidate.id === reviewedImportId) ?? -1;
  const reviewedImportCandidate = reviewedImportIndex >= 0 ? pendingImport?.candidates[reviewedImportIndex] ?? null : null;
  const reviewedBatchCandidate = reviewedImportCandidate?.duplicateDraftIndex !== null && reviewedImportCandidate?.duplicateDraftIndex !== undefined
    ? pendingImport?.candidates[reviewedImportCandidate.duplicateDraftIndex] ?? null
    : null;
  const reviewedImportExisting = reviewedImportCandidate?.duplicateMatches[0]?.contact ?? (reviewedBatchCandidate ? syntheticContact(reviewedBatchCandidate) : null);

  function showConfirmation(message: string) {
    setConfirmation(message);
    window.setTimeout(() => setConfirmation(null), 4500);
  }

  function closeManualModal() {
    setManualStep("closed");
    setManualDraft(emptyDraft);
    setManualError(null);
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
    const contact = await addManualContact(manualDraft, broker);
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
        resolutions: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.status === "new" ? "keep" : "unresolved"])),
        merges: {},
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
        mappingConfirmed: false,
        resolutions: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.status === "new" ? "keep" : "unresolved"])),
        merges: {},
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
          ? candidate.status === "new" ? "keep" : "unresolved"
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
      updateImportCandidate(batchExistingCandidate.id, {
        ...batchExistingCandidate.draft,
        ...Object.fromEntries((Object.keys(contactDraftLabels) as Array<keyof ContactDraft>).map((field) => [field, values[field]])),
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
    const draftsToInsert = pendingImport.candidates
      .filter((candidate) => pendingImport.resolutions[candidate.id] === "keep")
      .map((candidate) => candidate.draft)
      .filter(hasMinimumContactIdentity);
    for (const candidate of pendingImport.candidates) {
      const merge = pendingImport.merges[candidate.id];
      if (pendingImport.resolutions[candidate.id] === "merge" && merge) {
        await mergeDraftIntoContact(merge.targetId, candidate.draft, merge.values);
      }
    }
    const imported = draftsToInsert.length > 0 ? await importContacts(draftsToInsert, pendingImport.source) : [];
    setPendingImport(null);
    setImportError(null);
    showConfirmation(`${imported.length} nouveau${imported.length > 1 ? "x" : ""} contact${imported.length > 1 ? "s" : ""} importé${imported.length > 1 ? "s" : ""}.`);
  }

  async function reassignContact(contact: Contact, broker: ContactBroker) {
    await assignContact(contact.id, broker);
    setAssignmentTargetId(null);
    showConfirmation(`${getContactName(contact)} · ${BROKER_LABELS[broker]}`);
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
    setVisibleLimit(100);
  }, [activeFilter, search]);

  return (
    <main className="contacts-page">
      <div className="contacts-shell">
        <DataStatus />
        <header className="contacts-header">
          <div><p className="section-kicker">Répertoire de l’équipe</p><h1>CONTACTS</h1><p>{contacts.length} contacts sauvegardés dans le CRM.</p></div>
          <div className="contacts-main-actions">
            <button className="contact-action contact-action-primary" disabled={isSaving} onClick={() => setManualStep("details")} type="button">Ajouter un contact</button>
            <button className="contact-action" disabled={isSaving} onClick={() => setImportKind("csv")} type="button">Importer CSV</button>
            <button className="contact-action" disabled={isSaving} onClick={() => setImportKind("vcard")} type="button">Importer vCard</button>
          </div>
        </header>
        {unassignedCount > 0 && <button className="unassigned-alert" onClick={() => setActiveFilter("unassigned")} type="button"><span className="unassigned-alert-count">{unassignedCount}</span><span><strong>NON ATTRIBUÉS</strong><small>{unassignedCount} contact{unassignedCount > 1 ? "s" : ""} à classer</small></span><span aria-hidden="true">→</span></button>}
        <section className="contacts-directory">
          <div className="contacts-tools">
            <div className="contact-filters">{filterOptions.map((option) => <button aria-pressed={activeFilter === option.value} className={activeFilter === option.value ? "contact-filter-active" : ""} key={option.value} onClick={() => setActiveFilter(option.value)} type="button">{option.label} <span>{option.value === "all" ? contacts.length : contacts.filter((contact) => contact.broker === option.value).length}</span></button>)}</div>
            <label className="contacts-search"><span className="sr-only">Rechercher</span><span aria-hidden="true">⌕</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Nom, téléphone ou email" type="search" value={search} /></label>
          </div>
          <div className="contacts-list">
            <div className="contacts-list-head" aria-hidden="true"><span>Contact</span><span>Coordonnées</span><span>Courtier</span><span>Suivi</span><span>Actions</span></div>
            {pagedContacts.map((contact) => <article className="contact-row" key={contact.id}>
              <div className="contact-main-cell"><span className="contact-initials" aria-hidden="true">{[contact.firstName, contact.lastName].filter(Boolean).map((part) => part[0]).slice(0, 2).join("") || "?"}</span><div><h2>{getContactName(contact)}</h2><small>{contact.priority ? `Priorité · ${PRIORITY_LABELS[contact.priority]}` : "Priorité non définie"}</small></div></div>
              <div className="contact-coordinates">{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : <span>Téléphone non renseigné</span>}{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <span>Email non renseigné</span>}</div>
              <span className={`contact-broker-badge broker-${contact.broker}`}>{BROKER_LABELS[contact.broker]}</span><span className="contact-follow-up-cell">{contact.nextFollowUpDate ? formatFollowUpDate(contact.nextFollowUpDate) : "Aucune relance"}</span>
              <div className="contact-row-actions"><button onClick={() => router.push(`/contacts/${contact.id}`)} type="button">Ouvrir</button><button onClick={() => setAssignmentTargetId(contact.id)} type="button">Changer le courtier</button></div>
            </article>)}
            {!isLoading && visibleContacts.length === 0 && <div className="contacts-empty"><span aria-hidden="true">○</span><h2>Aucun contact trouvé</h2><p>Modifiez le filtre ou la recherche.</p></div>}
            {visibleLimit < visibleContacts.length && <div className="contacts-load-more"><span>{pagedContacts.length} sur {visibleContacts.length} contacts affichés</span><button onClick={() => setVisibleLimit((current) => current + 100)} type="button">Afficher 100 contacts de plus</button></div>}
          </div>
        </section>
      </div>

      {manualStep !== "closed" && <div className="contact-modal-backdrop"><section aria-modal="true" className="contact-modal contact-modal-medium" role="dialog">
        <header className="contact-modal-header"><div><p className="section-kicker">{manualStep === "details" ? "Nouveau contact" : "Attribution obligatoire"}</p><h2>{manualStep === "details" ? "Ajouter un contact" : "À QUI ATTRIBUER CE CONTACT ?"}</h2></div><button aria-label="Fermer" onClick={closeManualModal} type="button">×</button></header>
        {manualStep === "details" ? <form className="manual-contact-form" onSubmit={submitManualDetails}>
          {(Object.keys(contactDraftLabels) as Array<keyof ContactDraft>).map((field) => <label key={field}><span>{contactDraftLabels[field]}</span><input onChange={(event) => setManualDraft((current) => ({ ...current, [field]: event.target.value }))} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={manualDraft[field]} /></label>)}
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
        {pendingImport.mapping && <section className={`import-mapping-summary ${!pendingImport.mappingConfirmed ? "import-mapping-needs-confirmation" : ""}`}>
          <div className="import-mapping-heading"><div><strong>{pendingImport.mappingConfirmed ? (mappingWasAdjusted ? "Mapping confirmé ✓" : "Structure détectée automatiquement ✓") : "Vérification du mapping requise"}</strong><span>{pendingImport.mapping.hasHeader ? "Ligne d’en-tête reconnue" : "Fichier sans en-tête · première ligne conservée"}</span></div><small>Profil : {pendingImport.mapping.signature}</small></div>
          {pendingImport.mappingConfirmed ? <dl className="import-mapping-grid">
            {csvMappingFields.map((field) => {
              const match = pendingImport.mapping?.[field];
              if (!match && field === "fullName") return null;
              const alternatives = field === "phone" ? pendingImport.mapping?.phoneFallbacks.length ?? 0 : 0;
              return <div key={field}><dt>{csvMappingLabels[field]}</dt><dd>{match ? `${match.label} · ${Math.round(match.confidence * 100)} %${alternatives > 0 ? ` + ${alternatives} secours` : ""}` : "Non détecté"}</dd></div>;
            })}
          </dl> : <div className="import-mapping-confirmation">
            <p>Deux colonnes sont trop proches pour être départagées avec assez de certitude. Vérifiez seulement ce mapping.</p>
            <div className="import-mapping-selects">{csvMappingFields.map((field) => <label key={field}><span>{csvMappingLabels[field]}</span><select onChange={(event) => remapCSVField(field, event.target.value)} value={pendingImport.mapping?.[field]?.index ?? ""}><option value="">Non attribué</option>{pendingImport.mapping?.columns.map((column) => <option key={column.index} value={column.index}>{column.label}{column.example ? ` · ${column.example}` : ""}</option>)}</select></label>)}</div>
            <button onClick={() => { setImportError(null); setPendingImport((current) => current ? { ...current, mappingConfirmed: true } : null); }} type="button">CONFIRMER LE MAPPING</button>
          </div>}
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
              {resolution !== "unresolved" && <span className="import-resolution">{resolution === "keep" ? "Sera importé ✓" : resolution === "merge" ? "Fusionné ✓" : "Ignoré"}</span>}
            </div>
          </article>;
        })}</div>
      </section></div>}

      {manualDuplicate && <DuplicateResolutionModal existing={manualDuplicate.existing} existingNotesCount={notes.filter((note) => note.contactId === manualDuplicate.existing.id).length} incoming={{ ...manualDraft, broker: manualDuplicate.broker }} isSaving={isSaving} onCancel={() => { setManualDuplicate(null); setManualStep("details"); }} onKeepBoth={() => createManualContact(manualDuplicate.broker)} onMerge={mergeManual} reasons={manualDuplicate.reasons} />}
      {reviewedImportCandidate && pendingImport && <ImportContactReviewModal candidate={reviewedImportCandidate} existing={reviewedImportExisting} mapping={pendingImport.mapping} onClose={() => setReviewedImportId(null)} onNext={reviewedImportIndex < pendingImport.candidates.length - 1 ? () => setReviewedImportId(pendingImport.candidates[reviewedImportIndex + 1].id) : undefined} onPrevious={reviewedImportIndex > 0 ? () => setReviewedImportId(pendingImport.candidates[reviewedImportIndex - 1].id) : undefined} onSave={(draft) => updateImportCandidate(reviewedImportCandidate.id, draft)} position={reviewedImportIndex} source={pendingImport.source} total={pendingImport.candidates.length} />}
      {activeImportCandidate && activeImportExisting && <DuplicateResolutionModal existing={activeImportExisting} existingNotesCount={notes.filter((note) => note.contactId === activeImportExisting.id).length} incoming={{ ...activeImportCandidate.draft, broker: "unassigned" }} isSaving={isSaving} onCancel={() => { resolveImport(activeImportCandidate.id, "skip"); setActiveImportDuplicateId(null); }} onKeepBoth={() => { resolveImport(activeImportCandidate.id, "keep"); setActiveImportDuplicateId(null); }} onMerge={mergeImport} reasons={activeImportReasons} />}

      {assignmentTarget && <div className="contact-modal-backdrop contact-modal-top"><section aria-modal="true" className="contact-modal contact-modal-medium" role="dialog"><header className="contact-modal-header"><div><p className="section-kicker">{getContactName(assignmentTarget)}</p><h2>À QUI ATTRIBUER CE CONTACT ?</h2></div><button aria-label="Fermer" onClick={() => setAssignmentTargetId(null)} type="button">×</button></header><div className="broker-choice-grid">{CONTACT_ASSIGNMENTS.map((broker) => <button className={assignmentTarget.broker === broker ? "broker-choice-current" : ""} key={broker} onClick={() => void reassignContact(assignmentTarget, broker)} type="button"><span>{BROKER_LABELS[broker]}</span><span>{assignmentTarget.broker === broker ? "✓" : "→"}</span></button>)}</div></section></div>}
      {confirmation && <div aria-live="polite" className="follow-up-confirmation" role="status"><span>✓</span><strong>{confirmation}</strong></div>}
    </main>
  );
}
