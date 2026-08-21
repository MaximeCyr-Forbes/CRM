"use client";

import { useState, type FormEvent } from "react";
import type { CRMCalendarEvent, CRMCalendarEventInput } from "../data/calendar-event-types";
import type { CalendarBroker } from "../data/calendar-types";
import { BROKER_LABELS } from "../data/contact-types";
import {
  addCalendarDays,
  calendarDateTimeISO,
  eventCalendarDate,
  eventCalendarTime,
} from "../lib/google-calendar/calendar-date";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

function initialValues(event: CRMCalendarEvent | null, initialDate: string) {
  if (!event) return {
    title: "", description: "", location: "", allDay: false,
    startDate: initialDate, endDate: initialDate, startTime: "09:00", endTime: "10:00",
  };
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    allDay: event.allDay,
    startDate: eventCalendarDate(event),
    endDate: event.allDay ? addCalendarDays(event.end.slice(0, 10), -1) : eventCalendarDate(event),
    startTime: event.allDay ? "09:00" : eventCalendarTime(event, "start"),
    endTime: event.allDay ? "10:00" : eventCalendarTime(event, "end"),
  };
}

export function CalendarEventEditorModal({
  broker,
  event,
  initialDate,
  isSaving,
  onClose,
  onSave,
}: {
  broker: CalendarBroker;
  event: CRMCalendarEvent | null;
  initialDate: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: CRMCalendarEventInput) => Promise<void>;
}) {
  const [values, setValues] = useState(() => initialValues(event, initialDate));
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (isSaving) return;
    setError(null);
    if (!values.title.trim()) {
      setError("Ajoutez un titre à l’événement.");
      return;
    }
    const start = values.allDay
      ? values.startDate
      : calendarDateTimeISO(values.startDate, values.startTime);
    const end = values.allDay
      ? addCalendarDays(values.endDate || values.startDate, 1)
      : calendarDateTimeISO(values.startDate, values.endTime);
    if (end <= start) {
      setError("L’heure ou la date de fin doit suivre le début.");
      return;
    }
    try {
      await onSave({
        broker,
        title: values.title,
        description: values.description,
        location: values.location,
        allDay: values.allDay,
        start,
        end,
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Enregistrement impossible.");
    }
  }

  return (
    <div className="calendar-modal-backdrop" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && !isSaving && onClose()} role="presentation">
      <section aria-labelledby="calendar-editor-title" aria-modal="true" className="calendar-modal calendar-editor-modal" role="dialog">
        <header className="calendar-modal-heading">
          <div><p className="section-kicker">{BROKER_LABELS[broker]}</p><h2 id="calendar-editor-title">{event ? "MODIFIER L’ÉVÉNEMENT" : "NOUVEL ÉVÉNEMENT"}</h2></div>
          <button aria-label="Fermer" disabled={isSaving} onClick={onClose} type="button">×</button>
        </header>
        <form className="calendar-editor-form" onSubmit={submit}>
          <label className="calendar-field-wide"><span>Titre *</span><input autoFocus maxLength={200} onChange={(inputEvent) => setValues((current) => ({ ...current, title: inputEvent.target.value }))} required value={values.title} /></label>
          <label><span>Date *</span><input onChange={(inputEvent) => setValues((current) => ({ ...current, startDate: inputEvent.target.value, endDate: current.endDate < inputEvent.target.value ? inputEvent.target.value : current.endDate }))} required type="date" value={values.startDate} /></label>
          <label className="calendar-all-day"><input checked={values.allDay} onChange={(inputEvent) => setValues((current) => ({ ...current, allDay: inputEvent.target.checked }))} type="checkbox" /><span>Toute la journée</span></label>
          {values.allDay ? (
            <label><span>Date de fin</span><input min={values.startDate} onChange={(inputEvent) => setValues((current) => ({ ...current, endDate: inputEvent.target.value }))} type="date" value={values.endDate} /></label>
          ) : (
            <>
              <label><span>Heure de début *</span><input onChange={(inputEvent) => setValues((current) => ({ ...current, startTime: inputEvent.target.value }))} required type="time" value={values.startTime} /></label>
              <label><span>Heure de fin *</span><input onChange={(inputEvent) => setValues((current) => ({ ...current, endTime: inputEvent.target.value }))} required type="time" value={values.endTime} /></label>
            </>
          )}
          <label className="calendar-field-wide"><span>Lieu</span><input maxLength={500} onChange={(inputEvent) => setValues((current) => ({ ...current, location: inputEvent.target.value }))} value={values.location} /></label>
          <label className="calendar-field-wide"><span>Description</span><textarea maxLength={8000} onChange={(inputEvent) => setValues((current) => ({ ...current, description: inputEvent.target.value }))} rows={5} value={values.description} /></label>
          {error && <p className="calendar-form-error calendar-field-wide" role="alert">{error}</p>}
          <footer className="calendar-modal-actions calendar-field-wide">
            <button disabled={isSaving} onClick={onClose} type="button">Annuler</button>
            <button aria-busy={isSaving} className="calendar-primary-action" disabled={isSaving} type="submit">{isSaving ? "Enregistrement…" : "Enregistrer"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
