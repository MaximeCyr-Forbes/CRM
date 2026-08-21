"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBroker } from "../broker-context";
import { CalendarEventDeleteModal } from "../components/calendar-event-delete-modal";
import { CalendarEventDetailModal } from "../components/calendar-event-detail-modal";
import { CalendarEventEditorModal } from "../components/calendar-event-editor-modal";
import { CalendarDayView, CalendarMonthView, CalendarWeekView } from "../components/calendar-views";
import type { CRMCalendarEvent, CRMCalendarEventInput } from "../data/calendar-event-types";
import type { CalendarBroker, CalendarConnectionStatus } from "../data/calendar-types";
import { BROKER_LABELS } from "../data/contact-types";
import {
  calendarDateTimeISO,
  calendarRange,
  moveCalendarDate,
  todayInCalendarTimeZone,
  type CalendarView,
} from "../lib/google-calendar/calendar-date";
import { startCalendarPolling } from "../lib/google-calendar/calendar-polling";

type SyncState = "idle" | "syncing" | "error";

function periodLabel(view: CalendarView, date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (view === "month") return new Intl.DateTimeFormat("fr-CA", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
  if (view === "week") return `Semaine du ${new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parsed)}`;
  return new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeZone: "UTC" }).format(parsed);
}

async function responseError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error ?? fallback;
}

export default function CalendarPage() {
  const router = useRouter();
  const { selectedBroker, isBrokerReady } = useBroker();
  const today = useMemo(() => todayInCalendarTimeZone(), []);
  const [view, setView] = useState<CalendarView>("month");
  const [date, setDate] = useState(today);
  const [events, setEvents] = useState<CRMCalendarEvent[]>([]);
  const [isConnectionLoading, setIsConnectionLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionEmail, setConnectionEmail] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CRMCalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CRMCalendarEvent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState<CRMCalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const latestRefreshRef = useRef<() => Promise<void>>(async () => undefined);
  const previousBrokerRef = useRef<CalendarBroker | undefined>(undefined);
  const broker = selectedBroker?.toLowerCase() as CalendarBroker | undefined;
  const range = useMemo(() => calendarRange(view, date), [date, view]);

  const fetchEvents = useCallback(async (
    requestedBroker: CalendarBroker,
    requestedRange: typeof range,
    generation: number,
    foreground: boolean,
  ) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    if (foreground) setSyncState("syncing");
    try {
      const params = new URLSearchParams({
        broker: requestedBroker,
        start: calendarDateTimeISO(requestedRange.startDate, "00:00"),
        end: calendarDateTimeISO(requestedRange.endDate, "00:00"),
      });
      const response = await fetch(`/api/calendar/events?${params}`, { cache: "no-store", signal: controller.signal });
      if (response.status === 409) {
        if (generation === generationRef.current) {
          setIsConnected(false);
          setSyncState("idle");
        }
        return;
      }
      if (!response.ok) throw new Error(await responseError(response, "Impossible d’actualiser Google Agenda."));
      const payload = await response.json() as { data: CRMCalendarEvent[] };
      if (generation === generationRef.current) {
        setEvents(payload.data);
        setLastSyncedAt(new Date());
        setSyncState("idle");
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (generation === generationRef.current) setSyncState("error");
    } finally {
      if (generation === generationRef.current) requestInFlightRef.current = false;
    }
  }, []);

  latestRefreshRef.current = async () => {
    if (!broker || !isConnected) return;
    await fetchEvents(broker, range, generationRef.current, true);
  };

  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setView("day");
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    activeRequestRef.current?.abort();
    requestInFlightRef.current = false;
    const brokerChanged = previousBrokerRef.current !== broker;
    previousBrokerRef.current = broker;
    if (brokerChanged) setEvents([]);
    setSelectedEvent(null);
    if (brokerChanged) {
      setIsConnected(false);
      setConnectionEmail(null);
    }
    setSyncState("idle");
    if (!broker) return;
    const controller = new AbortController();
    setIsConnectionLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/google-calendar/connections", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Connexions indisponibles.");
        const payload = await response.json() as { connections: CalendarConnectionStatus[] };
        const connection = payload.connections.find((item) => item.broker === broker);
        if (generation !== generationRef.current) return;
        setIsConnected(Boolean(connection?.connected));
        setConnectionEmail(connection?.email ?? null);
        if (connection?.connected) await fetchEvents(broker, range, generation, true);
      } catch {
        if (!controller.signal.aborted && generation === generationRef.current) setSyncState("error");
      } finally {
        if (generation === generationRef.current) setIsConnectionLoading(false);
      }
    })();
    return () => {
      controller.abort();
      activeRequestRef.current?.abort();
      requestInFlightRef.current = false;
    };
  }, [broker, fetchEvents, range.endDate, range.startDate]);

  useEffect(() => {
    if (!broker || !isConnected) return;
    const polling = startCalendarPolling({ refresh: () => latestRefreshRef.current() });
    return () => polling.dispose();
  }, [broker, isConnected, range.endDate, range.startDate]);

  async function saveEvent(input: CRMCalendarEventInput) {
    setIsSaving(true);
    try {
      const eventId = editingEvent?.id;
      const response = await fetch(eventId ? `/api/calendar/events/${encodeURIComponent(eventId)}` : "/api/calendar/events", {
        method: eventId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        if (response.status === 404) void latestRefreshRef.current();
        throw new Error(await responseError(response, "Enregistrement impossible dans Google Agenda."));
      }
      const payload = await response.json() as { data: CRMCalendarEvent };
      setEvents((current) => eventId
        ? current.map((event) => event.id === payload.data.id ? payload.data : event)
        : [...current, payload.data].sort((first, second) => first.start.localeCompare(second.start)));
      setLastSyncedAt(new Date());
      setEditingEvent(null);
      setIsCreating(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletingEvent || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/calendar/events/${encodeURIComponent(deletingEvent.id)}?broker=${deletingEvent.broker}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await responseError(response, "Impossible de supprimer cet événement dans Google Agenda.");
        if (response.status === 404) void latestRefreshRef.current();
        throw new Error(message);
      }
      setEvents((current) => current.filter((event) => event.id !== deletingEvent.id));
      setDeletingEvent(null);
      setLastSyncedAt(new Date());
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Suppression impossible.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!isBrokerReady) return null;

  return (
    <main className="calendar-page">
      <div className="calendar-shell">
        <header className="calendar-page-header">
          <div><p className="section-kicker">Équipe Forbes · CRM</p><h1>CALENDRIER</h1><p>Votre horaire immobilier, synchronisé avec Google Agenda.</p></div>
          {broker && isConnected && <div className="calendar-account"><span>Agenda consulté</span><strong>{BROKER_LABELS[broker]}</strong>{connectionEmail && <small>{connectionEmail}</small>}</div>}
        </header>

        {!broker ? (
          <section className="calendar-empty-state"><span aria-hidden="true">◇</span><h2>SÉLECTIONNEZ UN COURTIER</h2><p>Sélectionnez un courtier pour afficher son calendrier.</p><button onClick={() => router.push("/")} type="button">Choisir un courtier</button></section>
        ) : isConnectionLoading && !isConnected ? (
          <section className="calendar-empty-state"><p>Vérification de Google Agenda…</p></section>
        ) : !isConnected ? (
          <section className="calendar-empty-state calendar-disconnected"><span aria-hidden="true">G</span><h2>GOOGLE AGENDA NON CONNECTÉ</h2><p>Le calendrier de {BROKER_LABELS[broker]} doit être connecté avant de pouvoir être affiché.</p><button onClick={() => window.location.assign(`/api/google-calendar/connect?broker=${broker}`)} type="button">Connecter Google Agenda</button></section>
        ) : (
          <>
            <section className="calendar-toolbar" aria-label="Commandes du calendrier">
              <div className="calendar-toolbar-navigation"><button onClick={() => setDate(today)} type="button">Aujourd’hui</button><button aria-label="Période précédente" onClick={() => setDate((current) => moveCalendarDate(current, view, -1))} type="button">←</button><h2>{periodLabel(view, date)}</h2><button aria-label="Période suivante" onClick={() => setDate((current) => moveCalendarDate(current, view, 1))} type="button">→</button></div>
              <div className="calendar-toolbar-actions">
                <div className="calendar-view-switch" role="group" aria-label="Vue du calendrier">{(["month", "week", "day"] as const).map((option) => <button aria-pressed={view === option} key={option} onClick={() => setView(option)} type="button">{{ month: "Mois", week: "Semaine", day: "Jour" }[option]}</button>)}</div>
                <button className="calendar-refresh" disabled={syncState === "syncing"} onClick={() => void latestRefreshRef.current()} type="button"><span aria-hidden="true">↻</span> {syncState === "syncing" ? "Synchronisation…" : "Actualiser"}</button>
                <button className="calendar-new-event" onClick={() => setIsCreating(true)} type="button">+ Nouvel événement</button>
              </div>
            </section>
            <div className={`calendar-sync-status is-${syncState}`} role="status">{syncState === "error" ? "Impossible d’actualiser Google Agenda. Les événements déjà affichés sont conservés." : syncState === "syncing" ? "Synchronisation…" : lastSyncedAt ? "Synchronisé il y a quelques secondes" : "Prêt à synchroniser"}</div>
            <div className="calendar-surface">
              {view === "month" && <CalendarMonthView date={date} events={events} onOpenDay={(isoDate) => { setDate(isoDate); setView("day"); }} onOpenEvent={setSelectedEvent} today={today} />}
              {view === "week" && <CalendarWeekView date={date} events={events} onOpenEvent={setSelectedEvent} today={today} />}
              {view === "day" && <CalendarDayView date={date} events={events} onOpenEvent={setSelectedEvent} today={today} />}
            </div>
          </>
        )}
      </div>
      {selectedEvent && <CalendarEventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onDelete={() => { setDeletingEvent(selectedEvent); setDeleteError(null); setSelectedEvent(null); }} onEdit={() => { setEditingEvent(selectedEvent); setSelectedEvent(null); }} onOpenCRM={(href) => { setSelectedEvent(null); router.push(href); }} />}
      {(isCreating || editingEvent) && broker && <CalendarEventEditorModal broker={broker} event={editingEvent} initialDate={date} isSaving={isSaving} onClose={() => { if (!isSaving) { setIsCreating(false); setEditingEvent(null); } }} onSave={saveEvent} />}
      {deletingEvent && <CalendarEventDeleteModal error={deleteError} event={deletingEvent} isDeleting={isDeleting} onCancel={() => { if (!isDeleting) { setDeletingEvent(null); setDeleteError(null); } }} onConfirm={confirmDelete} />}
    </main>
  );
}
