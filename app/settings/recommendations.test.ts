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

  it("utilise les classes responsive dédiées et ne propose ni suppression ni modification", () => {
    const component = source("app/components/settings-recommendations.tsx");
    const css = source("app/globals.css");
    expect(css).toContain(".settings-recommendations");
    expect(css).toContain(".recommendation-row");
    expect(css).toContain(".recommendation-detail-modal");
    expect(css).toContain("@media (max-width: 700px)");
    expect(component).not.toContain('method: "DELETE"');
    expect(component).not.toContain("SUPPRIMER");
    expect(component).not.toContain("MODIFIER");
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
