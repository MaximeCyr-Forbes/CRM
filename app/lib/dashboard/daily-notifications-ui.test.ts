import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const dashboard = source("app/dashboard/page.tsx");
const panel = source("app/components/daily-notifications-panel.tsx");
const styles = source("app/globals.css");

describe("interface Notifications du jour", () => {
  it("affiche le panel, son compteur et son état positif vide", () => {
    expect(dashboard).toContain("<DailyNotificationsPanel");
    expect(panel).toContain("NOTIFICATIONS DU JOUR");
    expect(panel).toContain("notifications.length");
    expect(panel).toContain("Aucune notification pour aujourd’hui.");
    expect(panel).toContain("Tout est à jour pour le moment.");
  });

  it("rend chaque notification accessible et navigue vers son href", () => {
    expect(panel).toContain("notifications.map");
    expect(panel).toContain("onClick={() => onNavigate(notification.href)}");
    expect(panel).toContain("aria-label={`Ouvrir ${notification.title}`}");
    expect(panel).toContain("OUVRIR");
    expect(panel).not.toContain("fetch(");
    expect(panel).not.toContain("google");
  });

  it("utilise les classes deux colonnes, scroll interne et empilement mobile", () => {
    for (const className of [
      "dashboard-priorities-grid",
      "daily-notifications-panel",
      "daily-notifications-header",
      "daily-notifications-count",
      "daily-notifications-list",
      "daily-notification-row",
      "daily-notification-type",
      "daily-notification-main",
      "daily-notification-open",
      "daily-notifications-empty",
    ]) expect(styles).toContain(`.${className}`);
    expect(styles).toContain("grid-template-columns: minmax(0, 1.85fr) minmax(18.5rem, 1fr)");
    expect(styles).toContain("max-height: 34rem");
    expect(styles).toContain("overflow-y: auto");
    expect(styles).toContain("@media (max-width: 1020px)");
  });

  it("signale les sources temporairement indisponibles sans masquer les autres notifications", () => {
    expect(dashboard).toContain("areListingsLoading || Boolean(listingsError)");
    expect(dashboard).toContain("areTransactionsLoading || Boolean(transactionsError)");
    expect(dashboard).toContain('selectedBroker !== "Maxime"');
    expect(dashboard).toContain('fetch("/api/recommendations", { cache: "no-store" })');
    expect(dashboard).toContain("recommendationsUnavailable={recommendationsUnavailable}");
    expect(panel).toContain("Certaines données Listings sont temporairement indisponibles.");
    expect(panel).toContain("Certaines données Transactions sont temporairement indisponibles.");
    expect(panel).toContain("Certaines recommandations sont temporairement indisponibles.");
  });

  it("affiche les recommandations avec leur lien profond sans les marquer comme lues", () => {
    expect(panel).toContain('recommendation: "RECOMMANDATION"');
    expect(dashboard).toContain("getDailyNotifications({ contacts, transactions, listings, recommendations");
    expect(dashboard).not.toContain('method: "PATCH"');
  });

  it("conserve toutes les métriques et le workflow Relances du jour", () => {
    for (const text of [
      "Relances aujourd’hui",
      "Relances en retard",
      "Acheteurs actifs",
      "Listings actifs",
      "Transactions actives",
      "RELANCES DU JOUR",
      "Commencer mes relances",
      "<DataStatus />",
    ]) expect(dashboard).toContain(text);
  });
});
