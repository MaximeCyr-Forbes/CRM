"use client";

import { BirthdayGreetingModal } from "../components/birthday-greeting-modal";
import { birthdayClock, resolvedBirthdayStatuses } from "../lib/birthday-greetings/model";
import { workspaceRequest } from "../lib/workspace-request";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useBroker } from "../broker-context";
import { useCRMData } from "../crm-data-context";
import { ShellIcon } from "../components/shell-icons";
import { DashboardActions, DashboardTransactions } from "./dashboard-panels";
import "./dashboard.css";
import { DataStatus } from "../components/data-status";
import { DailyNotificationsPanel } from "../components/daily-notifications-panel";
import { useContacts } from "../contacts-context";
import {
  CLIENT_TYPE_LABELS,
  PRIORITY_LABELS,
  getContactName,
  type ContactBroker,
} from "../data/contact-types";
import { toLocalISODate } from "../lib/follow-up";
import { isTransactionCompleted } from "../data/transaction-types";
import type { CRMRecommendation } from "../data/recommendation-types";
import { useListings } from "../listings-context";
import { useTransactions } from "../transactions-context";
import { getFollowUpQueue } from "../lib/follow-up-queue";
import { getDailyNotifications } from "../lib/dashboard/daily-notifications";
import { useFollowUps } from "../follow-up-context";

type FollowUpNotice = {
  message: string;
  tone: "success" | "error";
};

export default function Dashboard() {
  const router = useRouter();
  const { selectedBroker, workspaceUser, isBrokerReady, capabilities } = useBroker();
  const { contacts } = useContacts();
  const { isLoading: areContactsLoading, error: contactsError } = useCRMData();
  const { completeFollowUp } = useFollowUps();
  const { listings, isLoading: areListingsLoading, error: listingsError } = useListings();
  const { transactions, isLoading: areTransactionsLoading, error: transactionsError } = useTransactions();
  const completingFollowUpIdsRef = useRef(new Set<string>());
  const [completingFollowUpIds, setCompletingFollowUpIds] = useState<ReadonlySet<string>>(new Set());
  const [followUpNotice, setFollowUpNotice] = useState<FollowUpNotice | null>(null);
  const [recommendations, setRecommendations] = useState<CRMRecommendation[]>([]);
  const [recommendationsUnavailable, setRecommendationsUnavailable] = useState(false);
  const [birthdayContactId, setBirthdayContactId] = useState<string | null>(null);
  const [resolvedBirthdayIds, setResolvedBirthdayIds] = useState<string[]>([]);
  const [birthdayError, setBirthdayError] = useState(false);
  const [birthdayRevision, setBirthdayRevision] = useState(0);
  const today = birthdayClock().today;
  useEffect(() => {
    let current = true;
    async function refresh() {
      try {
        const r = await fetch("/api/birthday-greetings", { cache: "no-store" });
        const data = await r.json();
        if (!r.ok) throw new Error();
        if (current) { setResolvedBirthdayIds(data.states.filter((s: { status: string }) => resolvedBirthdayStatuses.has(s.status)).map((s: { contactId: string }) => s.contactId)); setBirthdayError(false); }
      } catch { if (current) setBirthdayError(true); }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [today, birthdayRevision]);
  const brokerKey = selectedBroker?.toLowerCase() as ContactBroker | undefined;
  const brokerContacts = brokerKey
    ? contacts.filter((contact) => contact.broker === brokerKey)
    : [];
  const todaysClients = brokerContacts.filter(
    (contact) => contact.nextFollowUpDate === today,
  );
  const lateClients = brokerContacts
    .filter((contact) => contact.nextFollowUpDate && contact.nextFollowUpDate < today)
    .sort((first, second) => first.nextFollowUpDate!.localeCompare(second.nextFollowUpDate!));
  const followUpQueue = brokerKey && brokerKey !== "unassigned"
    ? getFollowUpQueue(contacts, brokerKey, today)
    : [];
  const dailyNotifications = useMemo(
    () => brokerKey && brokerKey !== "unassigned"
      ? getDailyNotifications({ contacts, transactions, listings, recommendations, broker: brokerKey, today, resolvedBirthdayIds })
      : [],
    [brokerKey, contacts, listings, recommendations, today, transactions, resolvedBirthdayIds],
  );
  const metrics = [
    { label: "Relances aujourd’hui", value: todaysClients.length, tone: "today", href: todaysClients[0] ? `/contacts/${todaysClients[0].id}?mode=followups` : "/contacts" },
    {
      label: "Relances en retard",
      value: lateClients.length,
      tone: "late",
      href: lateClients[0] ? `/contacts/${lateClients[0].id}?mode=followups` : "/contacts",
    },
    {
      label: "Acheteurs actifs",
      value: brokerContacts.filter(
        (contact) => (contact.clientType === "buyer" || contact.clientType === "buyer_seller") && contact.status === "active",
      ).length,
      tone: "buyers",
      href: "/contacts",
    },
    {
      label: "Listings actifs",
      value: areListingsLoading || listingsError
        ? "—"
        : listings.filter((listing) => listing.broker === brokerKey && listing.status === "active").length,
      tone: "listings",
      href: brokerKey && brokerKey !== "unassigned" ? `/listings?broker=${brokerKey}&status=active` : "/listings",
    },
    {
      label: "Transactions actives",
      value: brokerKey ? transactions.filter((transaction) => transaction.broker === brokerKey && !isTransactionCompleted(transaction)).length : 0,
      tone: "transactions",
      href: brokerKey ? `/transactions?broker=${brokerKey}` : "/transactions",
    },
  ] as const;

  useEffect(() => {
    if (isBrokerReady && !selectedBroker) {
      router.replace("/");
    }
  }, [isBrokerReady, router, selectedBroker]);

  useEffect(() => {
    if (!capabilities.administerRecommendations) {
      setRecommendations([]);
      setRecommendationsUnavailable(false);
      return;
    }

    let isCurrent = true;
    setRecommendations([]);
    setRecommendationsUnavailable(false);
    void workspaceRequest("/api/recommendations", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement impossible");
        return response.json() as Promise<{ data?: CRMRecommendation[] }>;
      })
      .then((payload) => {
        if (!Array.isArray(payload.data)) throw new Error("Réponse invalide");
        if (isCurrent) setRecommendations(payload.data);
      })
      .catch(() => {
        if (isCurrent) setRecommendationsUnavailable(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [capabilities.administerRecommendations]);

  useEffect(() => {
    if (!followUpNotice) return;
    const timeout = window.setTimeout(() => setFollowUpNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [followUpNotice]);

  async function finishFollowUp(contactId: string, contactName: string) {
    if (completingFollowUpIdsRef.current.has(contactId)) return;
    completingFollowUpIdsRef.current.add(contactId);
    setCompletingFollowUpIds((current) => new Set(current).add(contactId));

    try {
      const { calendarSync } = await completeFollowUp(contactId);
      setFollowUpNotice(calendarSync.status === "error"
        ? {
            message: "Relance retirée du CRM · suppression Google Agenda à resynchroniser.",
            tone: "error",
          }
        : {
            message: `Relance de ${contactName} terminée.`,
            tone: "success",
          });
    } catch {
      setFollowUpNotice({
        message: "Impossible de terminer cette relance. Réessayez.",
        tone: "error",
      });
    } finally {
      completingFollowUpIdsRef.current.delete(contactId);
      setCompletingFollowUpIds((current) => {
        const next = new Set(current);
        next.delete(contactId);
        return next;
      });
    }
  }

  if (!isBrokerReady || !selectedBroker) {
    return null;
  }

  const activeTransactions = transactions.filter(transaction => transaction.broker === brokerKey && !isTransactionCompleted(transaction));
  const displayMetrics = [metrics[4], metrics[3], metrics[0], metrics[1], metrics[2]];
  const metricIcons = { transactions: "Transactions", listings: "Listings", today: "Calendrier", late: "Calendrier", buyers: "Contacts" };

  return (
    <main className="dashboard-page dashboard-premium">
      {birthdayContactId && <BirthdayGreetingModal contactId={birthdayContactId} onClose={() => setBirthdayContactId(null)} onResolved={() => { setResolvedBirthdayIds(ids => [...ids, birthdayContactId]); setBirthdayContactId(null); setBirthdayRevision(v => v + 1); }} />}
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-identity">
            <div>
              <p className="eyebrow">Équipe Forbes · CRM</p>
              <h1>Bonjour {workspaceUser === "immoplus" ? "Immoplus" : selectedBroker}</h1>
              <p className="dash-intro">Vue d’ensemble de votre journée.</p>
            </div>
          </div>
          <div className="dash-context"><span>{workspaceUser === "immoplus" ? "Courtier de travail" : "Votre espace"}</span><strong>{selectedBroker}</strong></div>
        </header>

        <DataStatus />

        <section className="metrics-section" aria-labelledby="overview-title">
          <h2 className="dash-sr-only" id="overview-title">Votre journée en un coup d’œil</h2>

          <div className="metrics-grid">
            {displayMetrics.map((metric) => (
              <button
                className={`metric-card metric-${metric.tone}`}
                key={metric.label}
                onClick={() => router.push(metric.href)}
                type="button"
              >
                <span className="dash-kpi-icon" aria-hidden="true"><ShellIcon name={metricIcons[metric.tone]} /></span>
                <span className="metric-value">{((metric.tone === "transactions" && (areTransactionsLoading || transactionsError)) || (["today", "late", "buyers"].includes(metric.tone) && (areContactsLoading || contactsError))) ? "—" : metric.value}</span>
                <span className="metric-label">{metric.label}</span>
                <span className="metric-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>

        <div className="dashboard-priorities-grid">
          <DashboardActions queue={areContactsLoading || contactsError ? [] : followUpQueue} transactions={areTransactionsLoading || transactionsError ? [] : activeTransactions} loading={areContactsLoading || areTransactionsLoading} unavailable={Boolean(contactsError || transactionsError)} today={today} onNavigate={href => router.push(href)} />
          <section className="follow-ups-section" aria-labelledby="follow-ups-title">
            <div className="follow-ups-heading">
              <div>
                <p className="section-kicker">Priorités</p>
                <h2 id="follow-ups-title">RELANCES DU JOUR</h2>
              </div>
              {followUpQueue.length > 0 ? (
                <button
                  className="start-follow-ups start-follow-ups-button"
                  onClick={() => router.push(`/contacts/${followUpQueue[0].id}?mode=followups`)}
                  type="button"
                >
                  <span>Commencer mes relances</span>
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <div aria-disabled="true" className="start-follow-ups start-follow-ups-inactive">
                  <span>Aucune relance à commencer</span>
                  <span aria-hidden="true">✓</span>
                </div>
              )}
            </div>

            <div className="follow-ups-list">
              {(areContactsLoading || contactsError) && <p className="dash-empty" role="status">{contactsError ?? "Chargement des relances…"}</p>}
              {!areContactsLoading && !contactsError && todaysClients.map((client) => (
                <article className="follow-up-row" key={client.id}>
                  <div className="client-avatar" aria-hidden="true">
                    {getContactName(client)
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="client-name-block">
                    <h3>{getContactName(client)}</h3>
                    <span>
                      {client.clientType ? CLIENT_TYPE_LABELS[client.clientType] : "Type non renseigné"}
                    </span>
                    <div className="client-follow-up-status">
                      <span className="status-dot" aria-hidden="true" />
                      Relance aujourd’hui
                    </div>
                  </div>
                  <div className="client-detail">
                    <span className="detail-label">Priorité</span>
                    <span className={`priority priority-${client.priority ?? "none"}`}>
                      {client.priority ? PRIORITY_LABELS[client.priority] : "Non renseignée"}
                    </span>
                  </div>
                  <div className="client-detail">
                    <span className="detail-label">Téléphone</span>
                    {client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : <span>Non renseigné</span>}
                  </div>
                  <div className="follow-up-actions">
                    <button
                      className="open-client"
                      onClick={() => router.push(`/contacts/${client.id}`)}
                      type="button"
                    >
                      Ouvrir
                    </button>
                    <button
                      aria-busy={completingFollowUpIds.has(client.id)}
                      aria-label={`Marquer la relance de ${getContactName(client)} comme faite`}
                      className="complete-follow-up"
                      disabled={completingFollowUpIds.has(client.id)}
                      onClick={() => void finishFollowUp(client.id, getContactName(client))}
                      type="button"
                    >
                      <span aria-hidden="true">✓</span>
                      {completingFollowUpIds.has(client.id) ? "…" : "Fait"}
                    </button>
                  </div>
                </article>
              ))}
              {!areContactsLoading && !contactsError && todaysClients.length === 0 && (
                <div className="follow-ups-empty">
                  <span aria-hidden="true">✓</span>
                  <p>Aucune relance programmée pour aujourd’hui.</p>
                </div>
              )}
            </div>
          </section>

          <DashboardTransactions transactions={activeTransactions} contacts={contacts} loading={areTransactionsLoading} error={transactionsError} onNavigate={href => router.push(href)} />

          {birthdayError && <p role="status">État des anniversaires temporairement indisponible. L’état sera vérifié avant toute action.</p>}
          <DailyNotificationsPanel
            onBirthday={setBirthdayContactId}
            listingsUnavailable={areListingsLoading || Boolean(listingsError)}
            notifications={dailyNotifications}
            onNavigate={(href) => router.push(href)}
            recommendationsUnavailable={recommendationsUnavailable}
            transactionsUnavailable={areTransactionsLoading || Boolean(transactionsError)}
          />
        </div>
      </div>
      {followUpNotice && (
        <div aria-live="polite" className={`follow-up-confirmation dashboard-follow-up-notice dashboard-follow-up-notice-${followUpNotice.tone}`} role="status">
          <span aria-hidden="true">{followUpNotice.tone === "success" ? "✓" : "!"}</span>
          <strong>{followUpNotice.message}</strong>
        </div>
      )}
    </main>
  );
}
