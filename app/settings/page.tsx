"use client";

import { useEffect, useState } from "react";
import { useCRMData } from "../crm-data-context";
import type {
  CalendarBroker,
  CalendarConnectionStatus,
} from "../data/calendar-types";
import { BROKER_LABELS } from "../data/contact-types";
import { SettingsRecommendations } from "../components/settings-recommendations";

const emptyConnections: CalendarConnectionStatus[] = (
  ["france", "maxime", "sandrine"] as const
).map((broker) => ({
  broker,
  connected: false,
  email: null,
  birthdays: { synced: 0, pending: 0, error: 0 },
  mortgageRenewals: { synced: 0, pending: 0, error: 0 },
}));

export default function SettingsPage() {
  const { retry: reloadContacts } = useCRMData();
  const [connections, setConnections] = useState(emptyConnections);
  const [isLoading, setIsLoading] = useState(true);
  const [activeBroker, setActiveBroker] = useState<CalendarBroker | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingBirthdays, setIsSyncingBirthdays] = useState(false);

  async function syncBirthdays(showResult = true) {
    setIsSyncingBirthdays(true);
    let synced = 0;
    let pending = 0;
    let errors = 0;
    try {
      for (let batch = 0; batch < 20; batch += 1) {
        const response = await fetch("/api/google-calendar/birthdays/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 40, retryErrors: batch === 0 }) });
        if (!response.ok) throw new Error("Synchronisation impossible");
        const result = (await response.json()) as { synced: number; pending: number; error: number; processed: number };
        synced += result.synced; pending += result.pending; errors += result.error;
        if (result.processed < 40 || result.synced + result.error === 0) break;
      }
      await loadConnections();
      if (showResult) setMessage(`${synced} anniversaire${synced > 1 ? "s" : ""} synchronisé${synced > 1 ? "s" : ""} · ${pending} en attente · ${errors} erreur${errors > 1 ? "s" : ""}.`);
    } catch {
      if (showResult) setError("La reprise des anniversaires n’a pas pu être terminée.");
    } finally {
      setIsSyncingBirthdays(false);
    }
  }

  async function loadConnections() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/google-calendar/connections", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Google Agenda indisponible.");
      }
      const payload = (await response.json()) as {
        connections: CalendarConnectionStatus[];
      };
      setConnections(payload.connections);
    } catch {
      setError("Impossible de charger les connexions Google Agenda.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("google");
    if (status === "connected") {
      setMessage("Google Agenda connecté avec succès.");
    } else if (status === "already-connected") {
      setMessage("Ce courtier possède déjà un Google Agenda connecté.");
    } else if (status === "cancelled") {
      setMessage("Connexion Google Agenda annulée.");
    } else if (status === "error") {
      setError("La connexion Google Agenda n’a pas pu être terminée.");
    }
    void loadConnections();
    void syncBirthdays(false);
  }, []);

  function connectCalendar(broker: CalendarBroker) {
    window.location.assign(`/api/google-calendar/connect?broker=${broker}`);
  }

  async function disconnectCalendar(broker: CalendarBroker) {
    setActiveBroker(broker);
    setError(null);
    try {
      const response = await fetch("/api/google-calendar/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error);
      }
      setMessage(`Google Agenda de ${BROKER_LABELS[broker]} déconnecté.`);
      await Promise.all([loadConnections(), reloadContacts()]);
    } catch {
      setError(
        "Impossible de déconnecter Google Agenda sans laisser de relance orpheline.",
      );
    } finally {
      setActiveBroker(null);
    }
  }

  return (
    <main className="settings-page">
      <section className="settings-shell" aria-labelledby="settings-title">
        <header className="settings-header">
          <p className="section-kicker">PARAMÈTRES</p>
          <h1 id="settings-title">GOOGLE AGENDA</h1>
          <p>
            Chaque courtier connecte son propre calendrier. Les relances restent
            toujours séparées.
          </p>
          <button className="calendar-connect" disabled={isSyncingBirthdays} onClick={() => void syncBirthdays()} type="button">{isSyncingBirthdays ? "SYNCHRONISATION…" : "SYNCHRONISER LES ANNIVERSAIRES"}</button>
        </header>

        {(isLoading || error || message) && (
          <div className={`settings-notice ${error ? "settings-notice-error" : ""}`} role="status">
            <span>
              {error ?? message ?? "Chargement des connexions Google Agenda..."}
            </span>
            {error && (
              <button onClick={() => void loadConnections()} type="button">
                Réessayer
              </button>
            )}
          </div>
        )}

        <div className="calendar-connections">
          {connections.map((connection) => (
            <article className="calendar-connection-card" key={connection.broker}>
              <div>
                <span className="calendar-broker-mark" aria-hidden="true">
                  {BROKER_LABELS[connection.broker].slice(0, 1)}
                </span>
                <div>
                  <h2>{BROKER_LABELS[connection.broker]}</h2>
                  <p>
                    {connection.connected
                      ? "Google Agenda connecté ✓"
                      : "Aucun Google Agenda connecté"}
                  </p>
                  {connection.email && <small>{connection.email}</small>}
                  <small>{connection.birthdays.synced} anniversaires synchronisés · {connection.birthdays.pending} en attente · {connection.birthdays.error} erreur{connection.birthdays.error > 1 ? "s" : ""}</small>
                </div>
              </div>

              {connection.connected ? (
                <button
                  className="calendar-disconnect"
                  disabled={activeBroker === connection.broker}
                  onClick={() => void disconnectCalendar(connection.broker)}
                  type="button"
                >
                  {activeBroker === connection.broker ? "Déconnexion..." : "Déconnecter"}
                </button>
              ) : (
                <button
                  className="calendar-connect"
                  disabled={activeBroker !== null}
                  onClick={() => connectCalendar(connection.broker)}
                  type="button"
                >
                  Connecter Google Agenda
                </button>
              )}
            </article>
          ))}
        </div>

        <SettingsRecommendations />
      </section>
    </main>
  );
}
