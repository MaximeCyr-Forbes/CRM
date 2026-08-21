"use client";

import type { CRMCalendarEvent } from "../data/calendar-event-types";
import { CALENDAR_EVENT_KIND_LABELS } from "../data/calendar-event-types";
import { BROKER_LABELS } from "../data/contact-types";
import { eventCalendarTime } from "../lib/google-calendar/calendar-date";
import { CALENDAR_TIME_ZONE } from "../lib/google-calendar/calendar-events";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

function dateLabel(event: CRMCalendarEvent) {
  if (event.allDay) {
    return new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeZone: "UTC" })
      .format(new Date(`${event.start}T12:00:00Z`));
  }
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeZone: CALENDAR_TIME_ZONE })
    .format(new Date(event.start));
}

function crmActionLabel(event: CRMCalendarEvent) {
  if (event.crmEntityKind === "listing") return "Ouvrir le Listing";
  if (event.crmEntityKind === "transaction" || event.eventKind === "transaction_deadline") return "Ouvrir la transaction";
  return "Ouvrir le contact";
}

export function CalendarEventDetailModal({ event, onClose, onDelete, onEdit, onOpenCRM }: {
  event: CRMCalendarEvent;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onOpenCRM: (href: string) => void;
}) {
  useDialogLifecycle(true, onClose);
  return (
    <div className="calendar-modal-backdrop" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="calendar-detail-title" aria-modal="true" className="calendar-modal calendar-detail-modal" role="dialog">
        <header className="calendar-modal-heading">
          <div><p className="section-kicker">{CALENDAR_EVENT_KIND_LABELS[event.eventKind]} · {BROKER_LABELS[event.broker]}</p><h2 id="calendar-detail-title">DÉTAIL DE L’ÉVÉNEMENT</h2></div>
          <button aria-label="Fermer" onClick={onClose} type="button">×</button>
        </header>
        <div className="calendar-detail-content">
          <h3>{event.title}</h3>
          <dl>
            <div><dt>Date</dt><dd>{dateLabel(event)}</dd></div>
            <div><dt>Heures</dt><dd>{event.allDay ? "Toute la journée" : `${eventCalendarTime(event, "start")} – ${eventCalendarTime(event, "end")}`}</dd></div>
            <div><dt>Calendrier</dt><dd>{BROKER_LABELS[event.broker]}</dd></div>
            {event.location && <div><dt>Lieu</dt><dd>{event.location}</dd></div>}
          </dl>
          {event.description && <div className="calendar-event-description"><span>Description</span><p>{event.description}</p></div>}
          {event.recurring && <p className="calendar-readonly-notice">Événement récurrent : modifiez la série directement dans Google Agenda.</p>}
          {event.readOnly && !event.recurring && <p className="calendar-readonly-notice">Cet événement est géré automatiquement depuis sa fiche CRM.</p>}
        </div>
        <footer className="calendar-modal-actions calendar-detail-actions">
          <button onClick={onClose} type="button">Fermer</button>
          {event.crmLink && <button onClick={() => onOpenCRM(event.crmLink!)} type="button">{crmActionLabel(event)}</button>}
          {event.htmlLink && <a href={event.htmlLink} rel="noopener noreferrer" target="_blank">Ouvrir dans Google</a>}
          {!event.readOnly && <button onClick={onEdit} type="button">Modifier</button>}
          {!event.readOnly && <button className="calendar-delete-action" onClick={onDelete} type="button">Supprimer</button>}
        </footer>
      </section>
    </div>
  );
}
