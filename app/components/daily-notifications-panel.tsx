"use client";

import type { DailyNotification, DailyNotificationType } from "../lib/dashboard/daily-notifications";

const TYPE_LABELS: Record<DailyNotificationType, string> = {
  mortgage_renewal: "RENOUVELLEMENT",
  transaction_deadline: "ÉCHÉANCE",
  listing_expiration: "LISTING",
  follow_up: "RELANCE",
  birthday: "ANNIVERSAIRE",
};

export function DailyNotificationsPanel({
  notifications,
  onNavigate,
  listingsUnavailable = false,
  transactionsUnavailable = false,
}: {
  notifications: ReadonlyArray<DailyNotification>;
  onNavigate: (href: string) => void;
  listingsUnavailable?: boolean;
  transactionsUnavailable?: boolean;
}) {
  return (
    <section className="daily-notifications-panel" aria-labelledby="daily-notifications-title">
      <div className="daily-notifications-header">
        <div>
          <p className="section-kicker">Priorités</p>
          <h2 id="daily-notifications-title">NOTIFICATIONS DU JOUR</h2>
        </div>
        <span aria-label={`${notifications.length} notifications`} className="daily-notifications-count">
          {notifications.length}
        </span>
      </div>

      {notifications.length > 0 ? (
        <div className="daily-notifications-list">
          {notifications.map((notification) => (
            <button
              aria-label={`Ouvrir ${notification.title}`}
              className={`daily-notification-row daily-notification-${notification.type}`}
              key={notification.id}
              onClick={() => onNavigate(notification.href)}
              type="button"
            >
              <span className="daily-notification-type">{TYPE_LABELS[notification.type]}</span>
              <span className="daily-notification-main">
                <strong>{notification.title}</strong>
                <span>{notification.detail}</span>
                {notification.secondaryDetail && <small>{notification.secondaryDetail}</small>}
              </span>
              <span className="daily-notification-open">OUVRIR <span aria-hidden="true">→</span></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="daily-notifications-empty">
          <span aria-hidden="true">✓</span>
          <strong>Aucune notification pour aujourd’hui.</strong>
          <p>Tout est à jour pour le moment.</p>
        </div>
      )}

      {(listingsUnavailable || transactionsUnavailable) && (
        <div className="daily-notifications-data-warning" role="status">
          {listingsUnavailable && <p>Certaines données Listings sont temporairement indisponibles.</p>}
          {transactionsUnavailable && <p>Certaines données Transactions sont temporairement indisponibles.</p>}
        </div>
      )}
    </section>
  );
}
