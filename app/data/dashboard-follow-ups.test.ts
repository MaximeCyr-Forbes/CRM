import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("relances du jour sur le dashboard", () => {
  const dashboard = source("app/dashboard/page.tsx");
  const followUpContext = source("app/follow-up-context.tsx");
  const css = source("app/globals.css");

  it("rend un élément statique, sans bouton désactivé, lorsque la queue est vide", () => {
    expect(dashboard).toContain("followUpQueue.length > 0 ?");
    expect(dashboard).toContain('className="start-follow-ups start-follow-ups-inactive"');
    expect(dashboard).toContain("Aucune relance à commencer");
    expect(dashboard).toContain('aria-disabled="true"');
    expect(dashboard).not.toContain('className="start-follow-ups"\n                disabled=');
  });

  it("conserve le vrai bouton actif et ouvre la première relance de la queue", () => {
    expect(dashboard).toContain('className="start-follow-ups start-follow-ups-button"');
    expect(dashboard).toContain("router.push(`/contacts/${followUpQueue[0].id}?mode=followups`)");
    expect(dashboard).toContain("Commencer mes relances");
  });

  it("centralise FAIT avec updateFollowUp(contactId, null)", () => {
    expect(followUpContext).toContain("const completeFollowUp = useCallback(");
    expect(followUpContext).toContain("await updateFollowUp(clientId, null)");
    expect(dashboard).toContain("const { completeFollowUp } = useFollowUps()");
    expect(dashboard).toContain("await completeFollowUp(contactId)");
    expect(dashboard).not.toContain("/api/complete-follow-up");
    expect(dashboard).not.toContain("fetch(");
  });

  it("bloque le double clic et charge uniquement le Contact ciblé", () => {
    expect(dashboard).toContain("completingFollowUpIdsRef.current.has(contactId)");
    expect(dashboard).toContain("completingFollowUpIdsRef.current.add(contactId)");
    expect(dashboard).toContain("completingFollowUpIds.has(client.id)");
    expect(dashboard).toContain('aria-busy={completingFollowUpIds.has(client.id)}');
    expect(dashboard).toContain('disabled={completingFollowUpIds.has(client.id)}');
  });

  it("affiche les confirmations de réussite, de resynchronisation Google et d’échec CRM", () => {
    expect(dashboard).toContain("Relance de ${contactName} terminée.");
    expect(dashboard).toContain("Relance retirée du CRM · suppression Google Agenda à resynchroniser.");
    expect(dashboard).toContain("Impossible de terminer cette relance. Réessayez.");
    expect(dashboard).toContain('role="status"');
    expect(dashboard).not.toContain("window.alert");
  });

  it("groupe OUVRIR et FAIT dans deux boutons accessibles distincts", () => {
    expect(dashboard).toContain('className="follow-up-actions"');
    expect(dashboard).toContain('className="open-client"');
    expect(dashboard).toContain('className="complete-follow-up"');
    expect(dashboard).toContain("Marquer la relance de ${getContactName(client)} comme faite");
    expect(dashboard).toContain('type="button"');
  });

  it("réserve le hover à l’état actif et empile les actions sans débordement sur mobile", () => {
    const inactiveBlock = css.match(/\.start-follow-ups-inactive\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(css).toContain(".start-follow-ups-button:hover");
    expect(css).not.toContain(".start-follow-ups-inactive:hover");
    expect(inactiveBlock).toContain("cursor: default");
    expect(inactiveBlock).toContain("transition: none");
    expect(css).toContain(".follow-up-actions");
    expect(css).toContain("grid-column: 1 / -1");
    expect(css).toContain("flex: 1 1 0");
  });
});

describe("suppression CRM et Google déjà existante", () => {
  const crmContext = source("app/crm-data-context.tsx");
  const crmRoute = source("app/api/crm/data/route.ts");
  const googleService = source("app/lib/google-calendar/service.ts");

  it("met le state React à jour après le succès CRM puis lance la synchronisation existante", () => {
    expect(crmContext).toContain('action: "updateFollowUp", contactId, nextDate');
    expect(crmContext).toContain("contact.id === contactId ? preserveAddressHistory(contact, updatedContact) : contact");
    expect(crmContext).toContain("requestCalendarSync([contactId])");
  });

  it("ne modifie que la relance et l’état de synchronisation dans l’action CRM", () => {
    const branch = crmRoute.slice(
      crmRoute.indexOf('body.action === "updateFollowUp"'),
      crmRoute.indexOf('body.action === "calendarFailure"'),
    );
    expect(branch).toContain("next_follow_up_date");
    expect(branch).not.toContain("last_contact_date");
    expect(branch).not.toContain("birth_date");
    expect(branch).not.toContain("mortgage_renewal_date");
    expect(branch).not.toContain("client_provenance");
    expect(branch).not.toContain("broker:");
  });

  it("supprime uniquement l’événement de relance et accepte les réponses Google 404/410", () => {
    expect(googleService).toContain("!contact.next_follow_up_date");
    expect(googleService).toContain("await deleteGoogleEvent(oldConnection, contact.google_calendar_event_id!)");
    expect(googleService).toContain("response.status !== 404 && response.status !== 410");
    expect(googleService).toContain("google_calendar_event_id: null");
    expect(googleService).toContain("google_calendar_event_broker: null");
    expect(googleService).toContain('google_calendar_sync_status: "synced"');
  });
});
