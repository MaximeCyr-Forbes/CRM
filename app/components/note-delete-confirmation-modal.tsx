"use client";

import type { ClientNote } from "../data/client-note-types";
import { formatHistoryDateTime } from "../lib/client-notes";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function NoteDeleteConfirmationModal({
  isDeleting,
  note,
  onCancel,
  onConfirm,
}: {
  isDeleting: boolean;
  note: ClientNote | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  useDialogLifecycle(note !== null, onCancel);
  if (!note) return null;

  return (
    <div className="contact-modal-backdrop contact-modal-top" onMouseDown={(event) => event.target === event.currentTarget && onCancel()} role="presentation">
      <section aria-labelledby="delete-note-title" aria-modal="true" className="contact-modal delete-note-modal" role="alertdialog">
        <header className="contact-modal-header">
          <div>
            <p className="section-kicker">SUPPRESSION DÉFINITIVE</p>
            <h2 id="delete-note-title">SUPPRIMER CETTE NOTE ?</h2>
          </div>
          <button aria-label="Fermer" disabled={isDeleting} onClick={onCancel} type="button">×</button>
        </header>
        <div className="delete-note-preview">
          <time>{formatHistoryDateTime(note.createdAt)}</time>
          <p>{note.content}</p>
        </div>
        <p>Cette action retirera définitivement cette note de l’historique.</p>
        <div className="delete-contact-actions">
          <button disabled={isDeleting} onClick={onCancel} type="button">ANNULER</button>
          <button className="destructive-button" disabled={isDeleting} onClick={() => void onConfirm()} type="button">
            {isDeleting ? "SUPPRESSION…" : "SUPPRIMER LA NOTE"}
          </button>
        </div>
      </section>
    </div>
  );
}
