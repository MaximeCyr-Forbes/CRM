"use client";

import { useCallback, useEffect, useRef } from "react";
import { getContactName, type Contact } from "../data/contact-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function ContactBulkDeleteModal({ contacts, isDeleting, progress, onClose, onConfirm }: {
  contacts: ReadonlyArray<Contact>;
  isDeleting: boolean;
  progress: { completed: number; total: number } | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const count = contacts.length;
  const closeIfIdle = useCallback(() => {
    if (!isDeleting) onClose();
  }, [isDeleting, onClose]);
  useDialogLifecycle(true, closeIfIdle);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  return (
    <div className="contact-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeIfIdle(); }} role="presentation">
      <section aria-labelledby="bulk-delete-contacts-title" aria-modal="true" className="contact-modal contact-bulk-delete-modal" role="alertdialog">
        <header className="contact-modal-header">
          <div><p className="section-kicker">Action irréversible</p><h2 id="bulk-delete-contacts-title">SUPPRIMER {count} CONTACT{count > 1 ? "S" : ""} ?</h2></div>
          <button aria-label="Fermer" disabled={isDeleting} onClick={closeIfIdle} type="button">×</button>
        </header>
        <div className="contact-bulk-delete-content">
          <p>Cette action supprimera définitivement les Contacts sélectionnés.</p>
          <ul>{contacts.slice(0, 3).map((contact) => <li key={contact.id}>{getContactName(contact)}</li>)}</ul>
          {count > 3 && <p className="contact-bulk-delete-more">+ {count - 3} autre{count - 3 > 1 ? "s" : ""}</p>}
          {progress && <p aria-live="polite" className="contact-bulk-delete-progress">Suppression… {progress.completed} / {progress.total}</p>}
        </div>
        <footer className="contact-bulk-delete-actions">
          <button disabled={isDeleting} onClick={closeIfIdle} ref={cancelButtonRef} type="button">Annuler</button>
          <button className="destructive-button" disabled={isDeleting} onClick={onConfirm} type="button">{isDeleting ? "Suppression…" : count === 1 ? "Supprimer le Contact" : `Supprimer les ${count} Contacts`}</button>
        </footer>
      </section>
    </div>
  );
}
