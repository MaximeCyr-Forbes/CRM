"use client";

import { useState, type DragEvent } from "react";
import {
  BROKER_LABELS,
  BUYER_PIPELINE_LABELS,
  BUYER_PIPELINE_STAGES,
  SELLER_PIPELINE_LABELS,
  SELLER_PIPELINE_STAGES,
  getContactName,
  type Contact,
  type PipelineStage,
  type PipelineType,
} from "../data/contact-types";
import { formatFollowUpDate, toLocalISODate } from "../lib/follow-up";

const priorityLabels = {
  hot: "🔥 Chaud",
  warm: "🟠 Tiède",
  cold: "❄️ Froid",
} as const;

export function PipelineBoard({
  contacts,
  pipeline,
  onMove,
  onOpen,
}: {
  contacts: ReadonlyArray<Contact>;
  pipeline: PipelineType;
  onMove: (contactId: string, pipeline: PipelineType, stage: PipelineStage) => Promise<void> | void;
  onOpen: (contactId: string) => void;
}) {
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);
  const [activeDropStage, setActiveDropStage] = useState<PipelineStage | null>(null);
  const stages = pipeline === "buyer" ? BUYER_PIPELINE_STAGES : SELLER_PIPELINE_STAGES;
  const labels = pipeline === "buyer" ? BUYER_PIPELINE_LABELS : SELLER_PIPELINE_LABELS;
  const today = toLocalISODate(new Date());

  function stageFor(contact: Contact): PipelineStage {
    return pipeline === "buyer" ? contact.buyerPipelineStage : contact.sellerPipelineStage;
  }

  function startDrag(event: DragEvent<HTMLElement>, contactId: string) {
    setDraggedContactId(contactId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", contactId);
  }

  function finishDrag() {
    setDraggedContactId(null);
    setActiveDropStage(null);
  }

  function drop(event: DragEvent<HTMLElement>, stage: PipelineStage) {
    event.preventDefault();
    const contactId = event.dataTransfer.getData("text/plain") || draggedContactId;
    finishDrag();
    if (contactId) void onMove(contactId, pipeline, stage);
  }

  function followUpLabel(contact: Contact) {
    if (!contact.nextFollowUpDate) return "Aucune relance";
    if (contact.nextFollowUpDate < today) {
      return `En retard · ${formatFollowUpDate(contact.nextFollowUpDate)}`;
    }
    if (contact.nextFollowUpDate === today) return "Relance aujourd’hui";
    return `Relance · ${formatFollowUpDate(contact.nextFollowUpDate)}`;
  }

  return (
    <div className="pipeline-board" aria-label={`Pipeline ${pipeline === "buyer" ? "acheteurs" : "vendeurs"}`}>
      {stages.map((stage) => {
        const stageContacts = contacts.filter((contact) => stageFor(contact) === stage);
        return (
          <section
            className={`pipeline-column ${activeDropStage === stage ? "pipeline-column-drop" : ""}`}
            key={stage}
            onDragEnter={() => setActiveDropStage(stage)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => drop(event, stage)}
          >
            <header className="pipeline-column-header">
              <h2>{labels[stage as keyof typeof labels]}</h2>
              <span>{stageContacts.length}</span>
            </header>
            <div className="pipeline-column-cards">
              {stageContacts.map((contact) => (
                <article
                  aria-label={`${getContactName(contact)}, ouvrir la fiche`}
                  className={`pipeline-card ${draggedContactId === contact.id ? "pipeline-card-dragging" : ""}`}
                  draggable
                  key={contact.id}
                  onClick={() => onOpen(contact.id)}
                  onDragEnd={finishDrag}
                  onDragStart={(event) => startDrag(event, contact.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onOpen(contact.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="pipeline-card-heading">
                    <strong>{getContactName(contact)}</strong>
                    <span className={`contact-broker-badge broker-${contact.broker}`}>
                      {BROKER_LABELS[contact.broker]}
                    </span>
                  </div>
                  <span className="pipeline-priority">
                    {contact.priority ? priorityLabels[contact.priority] : "Priorité non définie"}
                  </span>
                  <span className={`pipeline-follow-up ${contact.nextFollowUpDate && contact.nextFollowUpDate < today ? "pipeline-follow-up-late" : ""}`}>
                    {followUpLabel(contact)}
                  </span>
                  <label className="pipeline-mobile-stage" onClick={(event) => event.stopPropagation()}>
                    <span>Étape</span>
                    <select
                      aria-label={`Étape de ${getContactName(contact)}`}
                      onChange={(event) => void onMove(contact.id, pipeline, event.currentTarget.value as PipelineStage)}
                      value={stageFor(contact)}
                    >
                      {stages.map((option) => (
                        <option key={option} value={option}>{labels[option as keyof typeof labels]}</option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
              {stageContacts.length === 0 && (
                <div className="pipeline-column-empty">Déposez un contact ici</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
