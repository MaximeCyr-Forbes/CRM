"use client";

import type { CRMCalendarEvent } from "../data/calendar-event-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function CalendarEventDeleteModal({ event, isDeleting, error, onCancel, onConfirm }: {
  event: CRMCalendarEvent;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  useDialogLifecycle(true, onCancel);
  return (
    <div className="calendar-modal-backdrop calendar-delete-backdrop" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && !isDeleting && onCancel()} role="presentation">
      <section aria-labelledby="calendar-delete-title" aria-modal="true" className="calendar-modal calendar-delete-modal" role="alertdialog">
        <header className="calendar-modal-heading"><div><p className="section-kicker">Action définitive</p><h2 id="calendar-delete-title">SUPPRIMER CET ÉVÉNEMENT ?</h2></div></header>
        <div className="calendar-delete-content"><strong>« {event.title} »</strong><p>Cette action le supprimera aussi de Google Agenda.</p>{error && <p className="calendar-form-error" role="alert">{error}</p>}</div>
        <footer className="calendar-modal-actions"><button disabled={isDeleting} onClick={onCancel} type="button">Annuler</button><button aria-busy={isDeleting} className="calendar-delete-action" disabled={isDeleting} onClick={() => void onConfirm()} type="button">{isDeleting ? "Suppression…" : "Supprimer"}</button></footer>
      </section>
    </div>
  );
}
