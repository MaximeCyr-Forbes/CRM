"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { CRMCalendarEvent, CRMCalendarEventInput } from "../data/calendar-event-types";
import type { CalendarBroker } from "../data/calendar-types";
import type { GlobalSearchResult } from "../data/global-search-types";
import { BROKER_LABELS } from "../data/contact-types";
import { addCalendarDays, calendarDateTimeISO, eventCalendarDate, eventCalendarTime } from "../lib/google-calendar/calendar-date";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

function initialValues(event: CRMCalendarEvent | null, initialDate: string, initialStartTime?: string, initialEndTime?: string) {
  if (!event) return { title: "", description: "", location: "", allDay: false, startDate: initialDate, endDate: initialDate, startTime: initialStartTime ?? "09:00", endTime: initialEndTime ?? "10:00" };
  return { title: event.title, description: event.description, location: event.location, allDay: event.allDay, startDate: eventCalendarDate(event), endDate: event.allDay ? addCalendarDays(event.end.slice(0, 10), -1) : eventCalendarDate(event), startTime: event.allDay ? "09:00" : eventCalendarTime(event, "start"), endTime: event.allDay ? "10:00" : eventCalendarTime(event, "end") };
}

const ENTITY_LABELS = { contact: "CONTACT", listing: "LISTING", transaction: "TRANSACTION" } as const;

export function CalendarEventEditorModal({ broker, connectedBrokers = [broker], allowBrokerSelection = false, event, initialDate, initialStartTime, initialEndTime, isSaving, onClose, onSave }: {
  broker: CalendarBroker;
  connectedBrokers?: ReadonlyArray<CalendarBroker>;
  allowBrokerSelection?: boolean;
  event: CRMCalendarEvent | null;
  initialDate: string;
  initialStartTime?: string;
  initialEndTime?: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: CRMCalendarEventInput) => Promise<void>;
}) {
  const [values, setValues] = useState(() => initialValues(event, initialDate, initialStartTime, initialEndTime));
  const [selectedBroker, setSelectedBroker] = useState(event?.broker ?? broker);
  const [linkedEntity, setLinkedEntity] = useState<GlobalSearchResult | null>(() => event?.crmEntityKind && event.crmEntityId ? { id: event.crmEntityId, kind: event.crmEntityKind, title: `${ENTITY_LABELS[event.crmEntityKind]} lié`, detail: "Relation enregistrée dans Google Agenda", href: event.crmLink ?? "" } : null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<GlobalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  useEffect(() => {
    const query = linkQuery.trim();
    if (query.length < 2 || linkedEntity) { setLinkResults([]); setIsSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/crm/data?resource=globalSearch&q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => null) as { data?: GlobalSearchResult[] } | null;
        setLinkResults(response.ok ? payload?.data ?? [] : []);
      } catch {
        if (!controller.signal.aborted) setLinkResults([]);
      } finally { if (!controller.signal.aborted) setIsSearching(false); }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [linkQuery, linkedEntity]);

  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (isSaving) return;
    setError(null);
    if (!values.title.trim()) { setError("Ajoutez un titre à l’événement."); return; }
    const start = values.allDay ? values.startDate : calendarDateTimeISO(values.startDate, values.startTime);
    const end = values.allDay ? addCalendarDays(values.endDate || values.startDate, 1) : calendarDateTimeISO(values.startDate, values.endTime);
    if (end <= start) { setError("L’heure ou la date de fin doit suivre le début."); return; }
    try {
      await onSave({ broker: event?.broker ?? selectedBroker, title: values.title, description: values.description, location: values.location, allDay: values.allDay, start, end, crmEntityKind: linkedEntity?.kind ?? null, crmEntityId: linkedEntity?.id ?? null });
    } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : "Enregistrement impossible."); }
  }

  function selectEntity(result: GlobalSearchResult) {
    setLinkedEntity(result); setLinkQuery(""); setLinkResults([]);
    if (result.kind === "listing" && !values.location.trim()) setValues((current) => ({ ...current, location: result.title }));
  }

  return (
    <div className="calendar-modal-backdrop" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && !isSaving && onClose()} role="presentation">
      <section aria-labelledby="calendar-editor-title" aria-modal="true" className="calendar-modal calendar-editor-modal" role="dialog">
        <header className="calendar-modal-heading"><div><p className="section-kicker">{BROKER_LABELS[event?.broker ?? selectedBroker]}</p><h2 id="calendar-editor-title">{event ? "MODIFIER L’ÉVÉNEMENT" : "NOUVEL ÉVÉNEMENT"}</h2></div><button aria-label="Fermer" disabled={isSaving} onClick={onClose} type="button">×</button></header>
        <form className="calendar-editor-form" onSubmit={submit}>
          {(allowBrokerSelection || event) && <label className="calendar-field-wide"><span>Calendrier *</span>{event ? <strong className="calendar-readonly-broker">{BROKER_LABELS[event.broker]}</strong> : <select onChange={(inputEvent) => setSelectedBroker(inputEvent.target.value as CalendarBroker)} value={selectedBroker}>{connectedBrokers.map((item) => <option key={item} value={item}>{BROKER_LABELS[item]}</option>)}</select>}</label>}
          <label className="calendar-field-wide"><span>Titre *</span><input autoFocus maxLength={200} onChange={(inputEvent) => setValues((current) => ({ ...current, title: inputEvent.target.value }))} required value={values.title} /></label>
          <label><span>Date *</span><input onChange={(inputEvent) => setValues((current) => ({ ...current, startDate: inputEvent.target.value, endDate: current.endDate < inputEvent.target.value ? inputEvent.target.value : current.endDate }))} required type="date" value={values.startDate} /></label>
          <label className="calendar-all-day"><input checked={values.allDay} onChange={(inputEvent) => setValues((current) => ({ ...current, allDay: inputEvent.target.checked }))} type="checkbox" /><span>Toute la journée</span></label>
          {values.allDay ? <label><span>Date de fin</span><input min={values.startDate} onChange={(inputEvent) => setValues((current) => ({ ...current, endDate: inputEvent.target.value }))} type="date" value={values.endDate} /></label> : <><label><span>Heure de début *</span><input onChange={(inputEvent) => setValues((current) => ({ ...current, startTime: inputEvent.target.value }))} required type="time" value={values.startTime} /></label><label><span>Heure de fin *</span><input onChange={(inputEvent) => setValues((current) => ({ ...current, endTime: inputEvent.target.value }))} required type="time" value={values.endTime} /></label></>}
          <label className="calendar-field-wide"><span>Lieu</span><input maxLength={500} onChange={(inputEvent) => setValues((current) => ({ ...current, location: inputEvent.target.value }))} value={values.location} /></label>
          <label className="calendar-field-wide"><span>Description</span><textarea maxLength={8000} onChange={(inputEvent) => setValues((current) => ({ ...current, description: inputEvent.target.value }))} rows={5} value={values.description} /></label>
          <section className="calendar-crm-link calendar-field-wide" aria-labelledby="calendar-crm-link-title"><span id="calendar-crm-link-title">LIER AU CRM</span>{linkedEntity ? <article><div><small>{ENTITY_LABELS[linkedEntity.kind]}</small><strong>{linkedEntity.title}</strong><span>{linkedEntity.detail}</span></div><button aria-label="Retirer le lien CRM" onClick={() => setLinkedEntity(null)} type="button">× Retirer</button></article> : <><input aria-label="Rechercher un contact, un listing ou une transaction" onChange={(inputEvent) => setLinkQuery(inputEvent.target.value)} placeholder="Rechercher un contact, un listing ou une transaction" type="search" value={linkQuery} />{isSearching && <small>Recherche…</small>}{linkResults.length > 0 && <div className="calendar-link-results">{linkResults.map((result) => <button key={`${result.kind}:${result.id}`} onClick={() => selectEntity(result)} type="button"><small>{ENTITY_LABELS[result.kind]}</small><strong>{result.title}</strong><span>{result.detail}</span></button>)}</div>}</>}</section>
          {error && <p className="calendar-form-error calendar-field-wide" role="alert">{error}</p>}
          <footer className="calendar-modal-actions calendar-field-wide"><button disabled={isSaving} onClick={onClose} type="button">Annuler</button><button aria-busy={isSaving} className="calendar-primary-action" disabled={isSaving} type="submit">{isSaving ? "Enregistrement…" : "Enregistrer"}</button></footer>
        </form>
      </section>
    </div>
  );
}
