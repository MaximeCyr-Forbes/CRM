import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("interface des recommandations dans Paramètres", () => {
  it("ajoute la section sans modifier les actions Google Agenda", () => {
    const settings = source("app/settings/page.tsx");
    expect(settings).toContain("<SettingsRecommendations />");
    expect(settings).toContain("/api/google-calendar/connect?broker=${broker}");
    expect(settings).toContain("/api/google-calendar/disconnect");
    expect(settings).toContain("/api/google-calendar/birthdays/sync");
  });

  it("affiche un formulaire structuré et les confirmations demandées", () => {
    const component = source("app/components/settings-recommendations.tsx");
    expect(component).toContain("Amélioration du CRM");
    expect(component).toContain("RECOMMANDATIONS");
    expect(component).toContain("maxLength={120}");
    expect(component).toContain("maxLength={4000}");
    expect(component).toContain("ENVOYER LA RECOMMANDATION");
    expect(component).toContain("✓ Recommandation envoyée.");
    expect(component).toContain("La recommandation n’a pas pu être envoyée. Réessayez.");
    expect(component).not.toContain("window.alert");
  });

  it("limite visuellement l’administration à Maxime sans prétendre à une sécurité de rôle", () => {
    const component = source("app/components/settings-recommendations.tsx");
    expect(component).toContain('selectedBroker === "Maxime"');
    expect(component).toContain("TODO : remplacer cette vérification d’affichage par un vrai rôle utilisateur");
    expect(component).toContain("RECOMMANDATIONS REÇUES");
    expect(component).toContain("AUCUNE NON LUE");
    expect(component).toContain("NOUVELLE");
    expect(component).toContain("LUE");
  });

  it("fournit une modale accessible fermable par Escape avec restauration du focus", () => {
    const modal = source("app/components/recommendation-detail-modal.tsx");
    const lifecycle = source("app/lib/use-dialog-lifecycle.ts");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain("useDialogLifecycle(true, onClose)");
    expect(modal).toContain("previousFocus?.focus()");
    expect(lifecycle).toContain('event.key === "Escape"');
  });

  it("utilise les classes responsive dédiées et ne propose pas de modification", () => {
    const component = source("app/components/settings-recommendations.tsx");
    const css = source("app/globals.css");
    expect(css).toContain(".settings-recommendations");
    expect(css).toContain(".recommendation-row");
    expect(css).toContain(".recommendation-detail-modal");
    expect(css).toContain("@media (max-width: 700px)");
    expect(component).not.toContain("MODIFIER");
  });

  it("propose une suppression unique depuis la liste et la modale détail avec confirmation", () => {
    const component = source("app/components/settings-recommendations.tsx");
    const detail = source("app/components/recommendation-detail-modal.tsx");
    const confirmation = source("app/components/recommendation-delete-confirmation-modal.tsx");
    expect(component).toContain('method: "DELETE"');
    expect(component).toContain("async function deleteRecommendation(recommendationId: string)");
    expect(component).toContain("requestRecommendationDeletion(recommendation)");
    expect(component).toContain("requestRecommendationDeletion(openedRecommendation)");
    expect(component).toContain("current.filter((item) => item.id !== recommendationId)");
    expect(component).toContain("setOpenedRecommendation(null)");
    expect(detail).toContain("Supprimer");
    expect(confirmation).toContain("SUPPRIMER CETTE RECOMMANDATION ?");
    expect(confirmation).toContain("Cette action est définitive.");
    expect(confirmation).toContain("Annuler");
    expect(confirmation).not.toContain("window.alert");
    expect(confirmation).not.toContain("window.confirm");
  });

  it("ne monte jamais le détail et la confirmation de suppression en même temps", () => {
    const component = source("app/components/settings-recommendations.tsx");
    expect(component).toContain("openedRecommendation && !pendingDeletion");
    expect(component).toContain("pendingDeletion &&");
    expect(component).toContain("onClose={() => setPendingDeletion(null)}");
    expect(component).toContain("onClose={closeRecommendationDetail}");
  });

  it("nettoie le lien profond après fermeture ou suppression sans recharger la page", () => {
    const component = source("app/components/settings-recommendations.tsx");
    expect(component).toContain("useRouter()");
    expect(component).toContain("function clearRecommendationDeepLink()");
    expect(component).toContain('nextSearchParams.delete("recommendation")');
    expect(component).toContain('router.replace(query ? `/settings?${query}` : "/settings", { scroll: false })');
    expect(component).toContain("function closeRecommendationDetail()");
    expect(component).toContain("clearRecommendationDeepLink()");
    expect(component).not.toContain("window.location");
  });

  it("restaure le focus entre la confirmation, le détail et la page", () => {
    const detail = source("app/components/recommendation-detail-modal.tsx");
    const confirmation = source("app/components/recommendation-delete-confirmation-modal.tsx");
    expect(detail).toContain("previousFocus?.focus()");
    expect(confirmation).toContain("closeButtonRef.current?.focus()");
    expect(confirmation).toContain("previousFocus?.focus()");
  });

  it("maintient un état ciblé et recalcule le compteur depuis la liste filtrée", () => {
    const component = source("app/components/settings-recommendations.tsx");
    expect(component).toContain("deletingRecommendationId");
    expect(component).toContain("SUPPRESSION…");
    expect(component).toContain('recommendation.status === "unread"');
    expect(component).toContain('selectedBroker === "Maxime"');
    expect(component).toContain("✓ Recommandation supprimée.");
    expect(component).toContain("La recommandation n’a pas pu être supprimée. Réessayez.");
  });

  it("permet de marquer une recommandation faite depuis la liste et la modale sans double appel", () => {
    const component = source("app/components/settings-recommendations.tsx");
    const detail = source("app/components/recommendation-detail-modal.tsx");
    expect(component).toContain('body: JSON.stringify({ action: "complete" })');
    expect(component).toContain("acquireRecommendationCompletionLock");
    expect(component).toContain("releaseRecommendationCompletionLock");
    expect(component).toContain("recommendation-row-complete");
    expect(component).toContain("recommendation-completed-badge");
    expect(component).toContain("✓ Recommandation marquée comme faite.");
    expect(detail).toContain("recommendation-detail-completed");
    expect(detail).toContain("recommendation-detail-complete");
    expect(detail).toContain("Cette recommandation est traitée.");
  });

  it("garde lecture et traitement séparés et place les recommandations faites après les autres", () => {
    const types = source("app/data/recommendation-types.ts");
    const notifications = source("app/lib/dashboard/daily-notifications.ts");
    expect(types).toContain("isCompleted: boolean");
    expect(types).toContain("completedAt: string | null");
    expect(types).toContain("if (first.isCompleted !== second.isCompleted) return first.isCompleted ? 1 : -1;");
    expect(notifications).toContain('recommendation.status === "unread" && !recommendation.isCompleted');
  });

  it("ouvre automatiquement une recommandation ciblée par le lien du Dashboard", () => {
    const component = source("app/components/settings-recommendations.tsx");
    expect(component).toContain("useSearchParams()");
    expect(component).toContain('searchParams.get("recommendation")');
    expect(component).toContain("recommendations.find((item) => item.id === linkedRecommendationId)");
    expect(component).toContain("openedDeepLinkRef.current = linkedRecommendationId");
    expect(component).toContain("void openRecommendation(recommendation)");
    expect(component).toContain('method: "PATCH"');
    expect(component.indexOf("setOpenedRecommendation(recommendation)")).toBeLessThan(component.indexOf('method: "PATCH"'));
    expect(component).toContain("setOpenedRecommendation(updated)");
    expect(component).toContain("La recommandation n’a pas pu être marquée comme lue.");
  });

  it("supprime uniquement la recommandation ciblée dans Supabase", () => {
    const persistence = source("app/lib/recommendations/persistence.ts");
    expect(persistence).toContain("export async function deleteRecommendation(recommendationId: string)");
    expect(persistence).toContain('.from("crm_recommendations")');
    expect(persistence).toContain(".delete()");
    expect(persistence).toContain('.eq("id", recommendationId)');
    expect(persistence).toContain('.select("id")');
    expect(persistence).toContain(".maybeSingle()");
  });

  it("persiste le traitement de façon idempotente dans Supabase", () => {
    const persistence = source("app/lib/recommendations/persistence.ts");
    expect(persistence).toContain("export async function markRecommendationCompleted");
    expect(persistence).toContain(".update({ is_completed: true, completed_at: completedAt })");
    expect(persistence).toContain('.eq("is_completed", false)');
  });

  it("ajoute les colonnes de traitement par migration additive", () => {
    const migration = source("supabase/migrations/20260831123000_add_recommendation_completion.sql");
    expect(migration).toContain("add column if not exists is_completed boolean not null default false");
    expect(migration).toContain("add column if not exists completed_at timestamptz");
    expect(migration).toContain("crm_recommendations_completion_check");
    expect(migration).not.toMatch(/delete\s+from|truncate\s+table|drop\s+table/i);
  });

  it("déclare une migration additive protégée par RLS sans toucher aux données existantes", () => {
    const migration = source("supabase/migrations/20260821123000_create_crm_recommendations.sql");
    expect(migration).toContain("create table if not exists public.crm_recommendations");
    expect(migration).toContain("crm_recommendations_title_length_check");
    expect(migration).toContain("crm_recommendations_content_length_check");
    expect(migration).toContain("crm_recommendations_submitted_by_check");
    expect(migration).toContain("crm_recommendations_status_check");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.crm_recommendations from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update on public.crm_recommendations to service_role");
    expect(migration).not.toMatch(/delete\s+from|truncate\s+table|drop\s+table/i);
  });
});
