"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useBroker } from "../broker-context";
import { DataStatus } from "../components/data-status";
import { useContacts } from "../contacts-context";
import {
  CLIENT_TYPE_LABELS,
  PRIORITY_LABELS,
  getContactName,
  type ContactBroker,
} from "../data/contact-types";
import { toLocalISODate } from "../lib/follow-up";
import { isTransactionCompleted } from "../data/transaction-types";
import { useListings } from "../listings-context";
import { useTransactions } from "../transactions-context";
import { getFollowUpQueue } from "../lib/follow-up-queue";

export default function Dashboard() {
  const router = useRouter();
  const { selectedBroker, isBrokerReady } = useBroker();
  const { contacts } = useContacts();
  const { listings, isLoading: areListingsLoading, error: listingsError } = useListings();
  const { transactions } = useTransactions();
  const today = toLocalISODate(new Date());
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

  if (!isBrokerReady || !selectedBroker) {
    return null;
  }

  return (
    <main className="dashboard-page">
      <div className="dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-identity">
            <div>
              <p className="eyebrow">Équipe Forbes · CRM</p>
              <h1>Bonjour {selectedBroker}</h1>
            </div>
          </div>
          <span className="dashboard-broker-label">{selectedBroker.toUpperCase()}</span>
        </header>

        <DataStatus />

        <section className="metrics-section" aria-labelledby="overview-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Vue d’ensemble</p>
              <h2 id="overview-title">Votre journée en un coup d’œil</h2>
            </div>
            <span className="today-label">Aujourd’hui</span>
          </div>

          <div className="metrics-grid">
            {metrics.map((metric) => (
              <button
                className={`metric-card metric-${metric.tone}`}
                key={metric.label}
                onClick={() => router.push(metric.href)}
                type="button"
              >
                <span className="metric-topline" aria-hidden="true" />
                <span className="metric-value">{metric.value}</span>
                <span className="metric-label">{metric.label}</span>
                <span className="metric-arrow" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>

        <section className="follow-ups-section" aria-labelledby="follow-ups-title">
          <div className="follow-ups-heading">
            <div>
              <p className="section-kicker">Priorités</p>
              <h2 id="follow-ups-title">RELANCES DU JOUR</h2>
            </div>
            <button
              className="start-follow-ups"
              disabled={followUpQueue.length === 0}
              onClick={() => followUpQueue[0] && router.push(`/contacts/${followUpQueue[0].id}?mode=followups`)}
              type="button"
            >
              <span>Commencer mes relances</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <div className="follow-ups-list">
            {todaysClients.map((client) => (
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
                <div className="client-status">
                  <span className="status-dot" aria-hidden="true" />
                  Relance aujourd’hui
                </div>
                <button
                  className="open-client"
                  onClick={() => router.push(`/contacts/${client.id}`)}
                  type="button"
                >
                  Ouvrir
                </button>
              </article>
            ))}
            {todaysClients.length === 0 && (
              <div className="follow-ups-empty">
                <span aria-hidden="true">✓</span>
                <p>Aucune relance programmée pour aujourd’hui.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
