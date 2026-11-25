"use client";

import type { ClientNote } from "../data/client-note-types";
import { formatHistoryDateTime } from "../lib/client-notes";
import { PencilIcon, TrashIcon } from "./action-icons";
import { formatFollowUpCompletionTime, type ContactFollowUpCompletion } from "../data/contact-follow-up-types";
import { BROKER_LABELS } from "../data/contact-types";
import { formatFollowUpDate } from "../lib/follow-up";

type ClientHistoryProps = {
  notes: ReadonlyArray<ClientNote>;
  completions?: ReadonlyArray<ContactFollowUpCompletion>;
  onAdd: () => void;
  onDelete: (note: ClientNote) => void;
  onEdit: (note: ClientNote) => void;
};

export function ClientHistory({ notes, completions = [], onAdd, onDelete, onEdit }: ClientHistoryProps) {
  const entries = [
    ...notes.map(note => ({ at: note.createdAt, note, completion: null as ContactFollowUpCompletion | null, reverted: false })),
    ...completions.flatMap(completion => [
      { at: completion.completed_at, note: null, completion, reverted: false },
      ...(completion.reverted_at ? [{ at: completion.reverted_at, note: null, completion, reverted: true }] : []),
    ]),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <section className="notes-section" aria-labelledby="history-title">
      <div className="notes-heading">
        <div>
          <p className="section-kicker">Suivi du client</p>
          <h2 id="history-title">HISTORIQUE</h2>
        </div>
        <div className="notes-heading-actions">
          <span>{notes.length} note{notes.length > 1 ? "s" : ""}</span>
          <button className="notes-add-button" onClick={onAdd} type="button">+ Ajouter une note</button>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="notes-list">
          {entries.map(({ note, completion, reverted, at }, index) => note ? (
            <article className="note-row note-history-row" key={note.id}>
              <div className="note-marker" aria-hidden="true">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="note-content">
                <div className="note-meta">
                  <div>
                    <time>{formatHistoryDateTime(note.createdAt)}</time>
                    <strong>Ajouté par {note.createdBy}</strong>
                  </div>
                  <div className="note-actions">
                    <button aria-label={`Modifier la note du ${formatHistoryDateTime(note.createdAt)}`} onClick={() => onEdit(note)} title="Modifier" type="button"><PencilIcon /></button>
                    <button aria-label={`Supprimer la note du ${formatHistoryDateTime(note.createdAt)}`} className="note-delete-button" onClick={() => onDelete(note)} title="Supprimer" type="button"><TrashIcon /></button>
                  </div>
                </div>
                <p>{note.content}</p>
              </div>
            </article>
          ) : completion && <article className="note-row note-history-row" key={`${completion.id}-${reverted}`}>
            <div className="note-marker" aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span></div>
            <div className="note-content">
              <div className="note-meta"><div><time dateTime={at}>{formatFollowUpCompletionTime(at)}</time><strong>{reverted ? "CONFIRMATION ANNULÉE" : "SUIVI EFFECTUÉ"}</strong></div></div>
              <p>Relance prévue le {formatFollowUpDate(completion.scheduled_for)}</p>
              <p>{reverted ? "Annulé" : "Confirmé"} par {BROKER_LABELS[(reverted ? completion.reverted_by_broker : completion.completed_by_broker) as keyof typeof BROKER_LABELS] ?? "Membre de l’équipe"}</p>
              {!reverted && completion.reverted_at && <small>Confirmation annulée le {formatFollowUpCompletionTime(completion.reverted_at)}</small>}
            </div>
          </article>)}
        </div>
      ) : (
        <div className="notes-empty-state">
          <span aria-hidden="true">○</span>
          <p>Aucune note pour le moment.</p>
        </div>
      )}
    </section>
  );
}
