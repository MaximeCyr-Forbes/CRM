"use client";

import type { ClientNote } from "../data/client-note-types";
import { formatHistoryDateTime } from "../lib/client-notes";
import { PencilIcon, TrashIcon } from "./action-icons";

type ClientHistoryProps = {
  notes: ReadonlyArray<ClientNote>;
  onAdd: () => void;
  onDelete: (note: ClientNote) => void;
  onEdit: (note: ClientNote) => void;
};

export function ClientHistory({ notes, onAdd, onDelete, onEdit }: ClientHistoryProps) {
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

      {notes.length > 0 ? (
        <div className="notes-list">
          {notes.map((note, index) => (
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
          ))}
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
