"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBroker } from "../broker-context";
import { CalendarEventDeleteModal } from "../components/calendar-event-delete-modal";
import { CalendarEventDetailModal } from "../components/calendar-event-detail-modal";
import { CalendarEventEditorModal } from "../components/calendar-event-editor-modal";
import { CalendarDayView, CalendarMonthView, CalendarWeekView } from "../components/calendar-views";
import { calendarEventKey, type CRMCalendarEvent, type CRMCalendarEventInput } from "../data/calendar-event-types";
import type { CalendarBroker, CalendarConnectionStatus, CalendarWatchState } from "../data/calendar-types";
import { BROKER_LABELS } from "../data/contact-types";
import { calendarDateTimeISO, calendarRange, moveCalendarDate, todayInCalendarTimeZone, type CalendarView } from "../lib/google-calendar/calendar-date";
import { startCalendarTeamSyncMonitors } from "../lib/google-calendar/calendar-team-monitor";
import { selectVisibleCalendarEvents } from "../lib/google-calendar/calendar-team-events";
import { calculateCommonAvailability } from "../lib/google-calendar/team-availability";

type SyncState = "idle" | "syncing" | "error";
type CalendarMode = "personal" | "team";
type CreationPreset = { date: string; startTime?: string; endTime?: string };
const TEAM_BROKERS = ["france", "maxime", "sandrine"] as const;

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

function sortEvents(events: CRMCalendarEvent[]) {
  return events.sort((first, second) => first.start.localeCompare(second.start) || first.broker.localeCompare(second.broker) || first.title.localeCompare(second.title));
}

export default function CalendarPage() {
  const router = useRouter();
  const { selectedBroker, isBrokerReady } = useBroker();
  const today = useMemo(() => todayInCalendarTimeZone(), []);
  const [mode, setMode] = useState<CalendarMode>("personal");
  const [view, setView] = useState<CalendarView>("month");
  const [date, setDate] = useState(today);
  const [events, setEvents] = useState<CRMCalendarEvent[]>([]);
  const [connections, setConnections] = useState<CalendarConnectionStatus[]>([]);
  const [visibleTeamBrokers, setVisibleTeamBrokers] = useState<CalendarBroker[]>([]);
  const [brokerErrors, setBrokerErrors] = useState<Partial<Record<CalendarBroker, string>>>({});
  const [isConnectionLoading, setIsConnectionLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CRMCalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CRMCalendarEvent | null>(null);
  const [creationPreset, setCreationPreset] = useState<CreationPreset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState<CRMCalendarEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const controllersRef = useRef(new Map<CalendarBroker, AbortController>());
  const requestsRef = useRef(new Map<CalendarBroker, symbol>());
  const broker = selectedBroker?.toLowerCase() as CalendarBroker | undefined;
  const range = useMemo(() => calendarRange(view, date), [date, view]);
  const connectedBrokers = useMemo(() => connections.filter((item) => item.connected).map((item) => item.broker), [connections]);
  const connectedKey = connectedBrokers.join(",");
  const personalConnection = connections.find((item) => item.broker === broker);
  const personalConnected = Boolean(personalConnection?.connected);

  const fetchBrokerEvents = useCallback(async (requestedBroker: CalendarBroker, requestedRange: typeof range, generation: number, foreground: boolean) => {
    if (requestsRef.current.has(requestedBroker)) return;
    const requestToken = Symbol(requestedBroker);
    requestsRef.current.set(requestedBroker, requestToken);
    controllersRef.current.get(requestedBroker)?.abort();
    const controller = new AbortController();
    controllersRef.current.set(requestedBroker, controller);
    if (foreground) setSyncState("syncing");
    try {
      const params = new URLSearchParams({ broker: requestedBroker, start: calendarDateTimeISO(requestedRange.startDate, "00:00"), end: calendarDateTimeISO(requestedRange.endDate, "00:00") });
      const response = await fetch(`/api/calendar/events?${params}`, { cache: "no-store", signal: controller.signal });
      if (response.status === 409) {
        if (generation === generationRef.current) {
          setConnections((current) => current.map((connection) => connection.broker === requestedBroker
            ? { ...connection, connected: false, email: null }
            : connection));
          setSyncState("idle");
        }
        return;
      }
      if (!response.ok) throw new Error(await responseError(response, "Agenda temporairement indisponible."));
      const payload = await response.json() as { data: CRMCalendarEvent[] };
      if (generation !== generationRef.current) return;
      setEvents((current) => sortEvents([...current.filter((event) => event.broker !== requestedBroker), ...payload.data]));
      setBrokerErrors((current) => { const next = { ...current }; delete next[requestedBroker]; return next; });
      setLastSyncedAt(new Date());
      setSyncState("idle");
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setBrokerErrors((current) => ({ ...current, [requestedBroker]: error instanceof Error ? error.message : "Agenda temporairement indisponible." }));
      if (mode === "personal") setSyncState("error");
      else setSyncState("idle");
    } finally {
      if (requestsRef.current.get(requestedBroker) === requestToken) requestsRef.current.delete(requestedBroker);
      if (controllersRef.current.get(requestedBroker) === controller) controllersRef.current.delete(requestedBroker);
    }
  }, [mode]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 720px)").matches) setView("day");
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/google-calendar/connections", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const payload = await response.json() as { connections: CalendarConnectionStatus[] };
        setConnections(payload.connections);
        setVisibleTeamBrokers(payload.connections.filter((item) => item.connected).map((item) => item.broker));
      } catch { if (!controller.signal.aborted) setSyncState("error"); }
      finally { if (!controller.signal.aborted) setIsConnectionLoading(false); }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (isConnectionLoading) return;
    generationRef.current += 1;
    const generation = generationRef.current;
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear(); requestsRef.current.clear();
    setEvents([]); setBrokerErrors({}); setSelectedEvent(null); setSyncState("idle");
    const targets = mode === "team" ? connectedBrokers : broker && personalConnected ? [broker] : [];
    void Promise.allSettled(targets.map((item) => fetchBrokerEvents(item, range, generation, true)));
  }, [broker, connectedKey, fetchBrokerEvents, isConnectionLoading, mode, personalConnected, range.endDate, range.startDate]);

  useEffect(() => {
    if (isConnectionLoading) return;
    const targets = mode === "team" ? connectedBrokers : broker && personalConnected ? [broker] : [];
    const monitors = startCalendarTeamSyncMonitors(targets, (item) => ({
      checkState: async () => {
        const response = await fetch(`/api/calendar/change-state?broker=${item}`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        return response.json() as Promise<CalendarWatchState>;
      },
      ensureWatch: async () => {
        const response = await fetch("/api/calendar/watch/ensure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ broker: item }) });
        if (!response.ok) throw new Error();
        return response.json() as Promise<CalendarWatchState>;
      },
      refreshEvents: () => fetchBrokerEvents(item, range, generationRef.current, false),
    }));
    return () => monitors.dispose();
  }, [broker, connectedKey, fetchBrokerEvents, isConnectionLoading, mode, personalConnected, range.endDate, range.startDate]);

  const visibleEvents = useMemo(() => selectVisibleCalendarEvents(events, mode, broker, visibleTeamBrokers), [broker, events, mode, visibleTeamBrokers]);
  const availabilityBrokers = useMemo(() => connectedBrokers.filter((item) => visibleTeamBrokers.includes(item)), [connectedBrokers, visibleTeamBrokers]);
  const availability = useMemo(() => calculateCommonAvailability(events, date, availabilityBrokers), [availabilityBrokers, date, events]);
  const defaultCreationBroker = (broker && connectedBrokers.includes(broker) ? broker : connectedBrokers[0]) ?? broker;

  function toggleTeamBroker(item: CalendarBroker) {
    setVisibleTeamBrokers((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  }

  async function refreshVisible() {
    const targets = mode === "team" ? availabilityBrokers : broker && personalConnected ? [broker] : [];
    await Promise.allSettled(targets.map((item) => fetchBrokerEvents(item, range, generationRef.current, true)));
  }

  async function saveEvent(input: CRMCalendarEventInput) {
    setIsSaving(true);
    try {
      const eventId = editingEvent?.id;
      const response = await fetch(eventId ? `/api/calendar/events/${encodeURIComponent(eventId)}` : "/api/calendar/events", { method: eventId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      if (!response.ok) {
        if (response.status === 404) void fetchBrokerEvents(input.broker, range, generationRef.current, false);
        throw new Error(await responseError(response, "Enregistrement impossible dans Google Agenda."));
      }
      const payload = await response.json() as { data: CRMCalendarEvent };
      const key = calendarEventKey(payload.data);
      setEvents((current) => sortEvents(eventId ? current.map((event) => calendarEventKey(event) === key ? payload.data : event) : [...current, payload.data]));
      setLastSyncedAt(new Date()); setEditingEvent(null); setCreationPreset(null);
    } finally { setIsSaving(false); }
  }

  async function confirmDelete() {
    if (!deletingEvent || isDeleting) return;
    setIsDeleting(true); setDeleteError(null);
    try {
      const response = await fetch(`/api/calendar/events/${encodeURIComponent(deletingEvent.id)}?broker=${deletingEvent.broker}`, { method: "DELETE" });
      if (!response.ok) {
        if (response.status === 404) void fetchBrokerEvents(deletingEvent.broker, range, generationRef.current, false);
        throw new Error(await responseError(response, "Impossible de supprimer cet événement dans Google Agenda."));
      }
      const key = calendarEventKey(deletingEvent);
      setEvents((current) => current.filter((event) => calendarEventKey(event) !== key)); setDeletingEvent(null); setLastSyncedAt(new Date());
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "Suppression impossible."); }
    finally { setIsDeleting(false); }
  }

  if (!isBrokerReady) return null;
  const teamErrors = connectedBrokers.filter((item) => brokerErrors[item]).length;

  return (
    <main className="calendar-page"><div className="calendar-shell">
      <header className="calendar-page-header"><div><p className="section-kicker">Équipe Forbes · CRM</p><h1>CALENDRIER</h1><p>Votre horaire immobilier, synchronisé avec Google Agenda.</p><div className="calendar-mode-switch" role="group" aria-label="Mode du calendrier"><button aria-pressed={mode === "personal"} onClick={() => setMode("personal")} type="button">Mon calendrier</button><button aria-pressed={mode === "team"} onClick={() => setMode("team")} type="button">Équipe</button></div></div>{mode === "personal" && broker && personalConnected ? <div className="calendar-account"><span>Agenda consulté</span><strong>{BROKER_LABELS[broker]}</strong>{personalConnection?.email && <small>{personalConnection.email}</small>}</div> : mode === "team" ? <div className="calendar-account"><span>Vue équipe</span><strong>{connectedBrokers.length} agenda{connectedBrokers.length > 1 ? "s" : ""}</strong><small>France · Maxime · Sandrine</small></div> : null}</header>

      {isConnectionLoading ? <section className="calendar-empty-state"><p>Vérification de Google Agenda…</p></section> : mode === "personal" && !broker ? <section className="calendar-empty-state"><h2>SÉLECTIONNEZ UN COURTIER</h2><button onClick={() => router.push("/")} type="button">Choisir un courtier</button></section> : mode === "personal" && !personalConnected ? <section className="calendar-empty-state calendar-disconnected"><h2>GOOGLE AGENDA NON CONNECTÉ</h2><p>Le calendrier de {broker ? BROKER_LABELS[broker] : "ce courtier"} doit être connecté.</p><button onClick={() => broker && window.location.assign(`/api/google-calendar/connect?broker=${broker}`)} type="button">Connecter Google Agenda</button></section> : mode === "team" && connectedBrokers.length === 0 ? <section className="calendar-empty-state"><h2>AUCUN AGENDA CONNECTÉ</h2><button onClick={() => router.push("/settings")} type="button">Ouvrir les paramètres</button></section> : <>
        {mode === "team" && <section className="calendar-team-controls"><div><span>COURTIERS</span>{TEAM_BROKERS.map((item) => { const connection = connections.find((value) => value.broker === item); return <button aria-pressed={visibleTeamBrokers.includes(item)} className={`calendar-team-filter calendar-event-${item}`} disabled={!connection?.connected} key={item} onClick={() => toggleTeamBroker(item)} type="button"><span aria-hidden="true">{BROKER_LABELS[item].slice(0, 1)}</span>{BROKER_LABELS[item]}{!connection?.connected && <small>Agenda non connecté</small>}</button>; })}</div>{TEAM_BROKERS.filter((item) => brokerErrors[item]).map((item) => <p key={item}>Agenda {BROKER_LABELS[item]} temporairement indisponible.</p>)}</section>}
        <section className="calendar-toolbar" aria-label="Commandes du calendrier"><div className="calendar-toolbar-navigation"><button onClick={() => setDate(today)} type="button">Aujourd’hui</button><button aria-label="Période précédente" onClick={() => setDate((current) => moveCalendarDate(current, view, -1))} type="button">←</button><h2>{periodLabel(view, date)}</h2><button aria-label="Période suivante" onClick={() => setDate((current) => moveCalendarDate(current, view, 1))} type="button">→</button></div><div className="calendar-toolbar-actions"><div className="calendar-view-switch" role="group" aria-label="Vue du calendrier">{(["month", "week", "day"] as const).map((option) => <button aria-pressed={view === option} key={option} onClick={() => setView(option)} type="button">{{ month: "Mois", week: "Semaine", day: "Jour" }[option]}</button>)}</div><button className="calendar-refresh" disabled={syncState === "syncing"} onClick={() => void refreshVisible()} type="button">↻ {syncState === "syncing" ? "Synchronisation…" : "Actualiser"}</button><button className="calendar-new-event" disabled={!defaultCreationBroker} onClick={() => setCreationPreset({ date })} type="button">+ Nouvel événement</button></div></section>
        <div className={`calendar-sync-status is-${syncState}`} role="status">{mode === "team" ? teamErrors ? `${connectedBrokers.length - teamErrors} agendas synchronisés · ${teamErrors} indisponible${teamErrors > 1 ? "s" : ""}` : `Google synchronisé · ${connectedBrokers.length} agenda${connectedBrokers.length > 1 ? "s" : ""}` : syncState === "error" ? "Impossible d’actualiser Google Agenda. Les événements déjà affichés sont conservés." : syncState === "syncing" ? "Synchronisation…" : lastSyncedAt ? "Synchronisé il y a quelques secondes" : "Prêt à synchroniser"}</div>
        <div className="calendar-surface">{view === "month" && <CalendarMonthView date={date} events={visibleEvents} onOpenDay={(isoDate) => { setDate(isoDate); setView("day"); }} onOpenEvent={setSelectedEvent} today={today} />}{view === "week" && <CalendarWeekView date={date} events={visibleEvents} onOpenEvent={setSelectedEvent} onSelectDay={setDate} today={today} />}{view === "day" && <CalendarDayView date={date} events={visibleEvents} onOpenEvent={setSelectedEvent} today={today} />}</div>
        {mode === "team" && <section className="calendar-team-availability"><header><div><p className="section-kicker">DISPONIBILITÉS DE L’ÉQUIPE</p><h2>{new Intl.DateTimeFormat("fr-CA", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}</h2></div><small>08:00 – 18:00 · courtiers cochés</small></header><div>{availability.length ? availability.map((slot) => <button key={slot.start} onClick={() => setCreationPreset({ date: slot.date, startTime: slot.startTime, endTime: slot.endTime })} type="button">{slot.startTime} – {slot.endTime}</button>) : <p>{availabilityBrokers.length ? "Aucune disponibilité commune dans cette plage." : "Sélectionnez au moins un courtier connecté."}</p>}</div></section>}
      </>}
    </div>
    {selectedEvent && <CalendarEventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} onDelete={() => { setDeletingEvent(selectedEvent); setDeleteError(null); setSelectedEvent(null); }} onEdit={() => { setEditingEvent(selectedEvent); setSelectedEvent(null); }} onOpenCRM={(href) => { setSelectedEvent(null); router.push(href); }} />}
    {(creationPreset || editingEvent) && defaultCreationBroker && <CalendarEventEditorModal allowBrokerSelection={mode === "team" && !editingEvent} broker={editingEvent?.broker ?? defaultCreationBroker} connectedBrokers={connectedBrokers} event={editingEvent} initialDate={creationPreset?.date ?? date} initialEndTime={creationPreset?.endTime} initialStartTime={creationPreset?.startTime} isSaving={isSaving} onClose={() => { if (!isSaving) { setCreationPreset(null); setEditingEvent(null); } }} onSave={saveEvent} />}
    {deletingEvent && <CalendarEventDeleteModal error={deleteError} event={deletingEvent} isDeleting={isDeleting} onCancel={() => { if (!isDeleting) { setDeletingEvent(null); setDeleteError(null); } }} onConfirm={confirmDelete} />}
    </main>
  );
}
