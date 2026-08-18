"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBroker } from "../broker-context";
import { DataStatus } from "../components/data-status";
import { DuplicateResolutionModal } from "../components/duplicate-resolution-modal";
import { PipelineBoard } from "../components/pipeline-board";
import { useContacts } from "../contacts-context";
import { useCRMData } from "../crm-data-context";
import {
  BROKER_LABELS,
  CONTACT_BROKERS,
  contactBelongsToPipeline,
  getContactName,
  type Contact,
  type ContactBroker,
  type ContactDraft,
  type DraftMergeSelection,
  type PipelineStage,
  type PipelineType,
} from "../data/contact-types";
import {
  findDuplicateMatches,
  hasMinimumContactIdentity,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  searchableContactText,
  type DuplicateReason,
} from "../lib/contact-normalization";

type BrokerFilter = "all" | Exclude<ContactBroker, "unassigned">;
type AddStep = "closed" | "details" | "assignment";
type PendingDuplicate = {
  broker: Exclude<ContactBroker, "unassigned">;
  existing: Contact;
  reasons: DuplicateReason[];
};

const emptyDraft: ContactDraft = {
  firstName: "", lastName: "", phone: "", email: "",
  civicNumber: "", address: "", apartment: "", city: "", province: "", postalCode: "", country: "",
};
type PipelineDraftField = Exclude<keyof ContactDraft, "civicNumber">;
const draftLabels: Record<PipelineDraftField, string> = {
  firstName: "Prénom", lastName: "Nom", phone: "Téléphone", email: "Email",
  address: "Adresse", apartment: "Appartement", city: "Ville", province: "Province",
  postalCode: "Code postal", country: "Pays",
};

function combinedClientType(existing: Contact["clientType"], pipeline: PipelineType) {
  if (!existing || existing === pipeline) return pipeline;
  return "buyer_seller" as const;
}

export default function PipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const {
    contacts,
    addManualContact,
    mergeDraftIntoContact,
    updateContact,
    updatePipelineStage,
  } = useContacts();
  const { notes, loadNotesForContact, isSaving } = useCRMData();
  const [pipeline, setPipeline] = useState<PipelineType>("buyer");
  const [brokerFilter, setBrokerFilter] = useState<BrokerFilter>("all");
  const [search, setSearch] = useState("");
  const [addStep, setAddStep] = useState<AddStep>("closed");
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    const queryBroker = searchParams.get("broker");
    const queryType = searchParams.get("type");
    if (queryType === "buyer" || queryType === "seller") setPipeline(queryType);
    if (CONTACT_BROKERS.includes(queryBroker as Exclude<ContactBroker, "unassigned">)) {
      setBrokerFilter(queryBroker as BrokerFilter);
    } else if (selectedBroker) {
      setBrokerFilter(selectedBroker.toLowerCase() as BrokerFilter);
    }
  }, [searchParams, selectedBroker]);

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  const normalizedTerms = [normalizeName(search), normalizePhone(search), normalizeEmail(search)].filter(Boolean);
  const visibleContacts = useMemo(
    () => contacts
      .filter((contact) => contactBelongsToPipeline(contact, pipeline))
      .filter((contact) => brokerFilter === "all" || contact.broker === brokerFilter)
      .filter((contact) => normalizedTerms.length === 0 || normalizedTerms.some((term) => searchableContactText(contact).includes(term))),
    [brokerFilter, contacts, normalizedTerms.join("|"), pipeline],
  );

  const stats = pipeline === "buyer"
    ? [
        ["Clients", visibleContacts.filter((contact) => contact.buyerPipelineStage !== "purchased").length],
        ["En visites", visibleContacts.filter((contact) => contact.buyerPipelineStage === "visits").length],
        ["Offres / PA", visibleContacts.filter((contact) => contact.buyerPipelineStage === "offer").length],
        ["Notaire", visibleContacts.filter((contact) => contact.buyerPipelineStage === "notary").length],
      ]
    : [
        ["Clients", visibleContacts.filter((contact) => contact.sellerPipelineStage !== "sold").length],
        ["En marché", visibleContacts.filter((contact) => contact.sellerPipelineStage === "on_market").length],
        ["Offres reçues", visibleContacts.filter((contact) => contact.sellerPipelineStage === "offer_received").length],
        ["Notaire", visibleContacts.filter((contact) => contact.sellerPipelineStage === "notary").length],
      ];

  function closeAdd() {
    setAddStep("closed");
    setDraft(emptyDraft);
    setFormError(null);
    setPendingDuplicate(null);
  }

  function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasMinimumContactIdentity(draft)) {
      setFormError("Ajoutez au minimum un nom, un téléphone ou un email.");
      return;
    }
    setFormError(null);
    setAddStep("assignment");
  }

  async function chooseBroker(broker: Exclude<ContactBroker, "unassigned">) {
    const duplicate = findDuplicateMatches(draft, contacts)[0];
    if (duplicate) {
      setPendingDuplicate({ broker, existing: duplicate.contact, reasons: duplicate.reasons });
      await loadNotesForContact(duplicate.contact.id);
      return;
    }
    await createContact(broker);
  }

  async function createContact(broker: Exclude<ContactBroker, "unassigned">) {
    const contact = await addManualContact(draft, broker, { clientType: pipeline });
    closeAdd();
    setConfirmation(`${getContactName(contact)} a été ajouté au pipeline.`);
  }

  async function mergeDuplicate(values: DraftMergeSelection) {
    if (!pendingDuplicate) return;
    const merged = await mergeDraftIntoContact(pendingDuplicate.existing.id, draft, values);
    await updateContact(merged.id, {
      firstName: merged.firstName,
      lastName: merged.lastName,
      phone: merged.phone,
      email: merged.email,
      civicNumber: merged.civicNumber,
      address: merged.address,
      apartment: merged.apartment,
      city: merged.city,
      province: merged.province,
      postalCode: merged.postalCode,
      country: merged.country,
      broker: merged.broker,
      clientType: combinedClientType(merged.clientType, pipeline),
      priority: merged.priority,
      status: merged.status,
    });
    closeAdd();
    setConfirmation(`${getContactName(merged)} a été fusionné et ajouté au pipeline.`);
  }

  async function moveContact(contactId: string, activePipeline: PipelineType, stage: PipelineStage) {
    await updatePipelineStage(contactId, activePipeline, stage);
  }

  return (
    <main className="pipeline-page">
      <div className="pipeline-shell">
        <DataStatus />

        <header className="pipeline-header">
          <div>
            <p className="section-kicker">Vue commerciale</p>
            <h1>PIPELINE</h1>
            <p>Faites glisser une fiche pour changer son étape.</p>
          </div>
          <button className="pipeline-add" onClick={() => setAddStep("details")} type="button">
            + Ajouter un client
          </button>
        </header>

        <section className="pipeline-controls" aria-label="Filtres du pipeline">
          <div className="pipeline-type-toggle">
            <button aria-pressed={pipeline === "buyer"} onClick={() => setPipeline("buyer")} type="button">ACHETEURS</button>
            <button aria-pressed={pipeline === "seller"} onClick={() => setPipeline("seller")} type="button">VENDEURS</button>
          </div>
          <div className="pipeline-broker-filter">
            <button aria-pressed={brokerFilter === "all"} onClick={() => setBrokerFilter("all")} type="button">Tous</button>
            {CONTACT_BROKERS.map((broker) => (
              <button aria-pressed={brokerFilter === broker} key={broker} onClick={() => setBrokerFilter(broker)} type="button">
                {BROKER_LABELS[broker]}
              </button>
            ))}
          </div>
          <label className="pipeline-search">
            <span className="sr-only">Rechercher dans le pipeline</span>
            <span aria-hidden="true">⌕</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Nom, téléphone ou email" type="search" value={search} />
          </label>
        </section>

        <section className="pipeline-stats" aria-label="Statistiques du pipeline">
          {stats.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}
        </section>

        <PipelineBoard
          contacts={visibleContacts}
          onMove={moveContact}
          onOpen={(contactId) => router.push(`/contacts/${contactId}`)}
          pipeline={pipeline}
        />
      </div>

      {addStep !== "closed" && (
        <div className="contact-modal-backdrop contact-modal-top">
          <section aria-modal="true" className="contact-modal contact-modal-medium" role="dialog">
            <header className="contact-modal-header">
              <div>
                <p className="section-kicker">{pipeline === "buyer" ? "Pipeline acheteurs" : "Pipeline vendeurs"}</p>
                <h2>{addStep === "details" ? "Ajouter un client" : "À QUI ATTRIBUER CE CONTACT ?"}</h2>
              </div>
              <button aria-label="Fermer" onClick={closeAdd} type="button">×</button>
            </header>
            {addStep === "details" ? (
              <form className="manual-contact-form" onSubmit={submitDetails}>
                {(Object.keys(draftLabels) as PipelineDraftField[]).map((field) => (
                  <label key={field}>
                    <span>{draftLabels[field]}</span>
                    <input onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={draft[field]} />
                  </label>
                ))}
                <p className="pipeline-prefill">Type prérempli : <strong>{pipeline === "buyer" ? "Acheteur" : "Vendeur"}</strong></p>
                {formError && <p className="import-error">{formError}</p>}
                <button className="manual-contact-continue" type="submit">Continuer vers l’attribution</button>
              </form>
            ) : (
              <div className="broker-choice-grid">
                {CONTACT_BROKERS.map((broker) => (
                  <button disabled={isSaving} key={broker} onClick={() => void chooseBroker(broker)} type="button">
                    <span>{BROKER_LABELS[broker]}</span><span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {pendingDuplicate && (
        <DuplicateResolutionModal
          existing={pendingDuplicate.existing}
          existingNotesCount={notes.filter((note) => note.contactId === pendingDuplicate.existing.id).length}
          incoming={{ ...draft, broker: pendingDuplicate.broker }}
          isSaving={isSaving}
          onCancel={() => setPendingDuplicate(null)}
          onKeepBoth={() => createContact(pendingDuplicate.broker)}
          onMerge={mergeDuplicate}
          reasons={pendingDuplicate.reasons}
        />
      )}

      {confirmation && (
        <div aria-live="polite" className="follow-up-confirmation" role="status">
          <span aria-hidden="true">✓</span><strong>{confirmation}</strong>
        </div>
      )}
    </main>
  );
}
