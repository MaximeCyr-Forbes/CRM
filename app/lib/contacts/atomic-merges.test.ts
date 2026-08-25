import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260825143000_make_contact_merges_atomic.sql";
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const service = readFileSync(resolve(process.cwd(), "app/lib/contacts/server-service.ts"), "utf8");

function sqlFunction(source: string, name: string, nextMarker: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  const end = source.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("fusions atomiques des Contacts", () => {
  it("est une migration structurelle qui ne lance aucune fusion", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    const beforeFunctions = migration.slice(0, migration.indexOf("create or replace function"));
    expect(beforeFunctions).not.toMatch(/update\s+public\.(contacts|client_notes|transaction_contacts)/i);
    expect(beforeFunctions).not.toMatch(/delete\s+from\s+public\.(contacts|client_notes|transaction_contacts)/i);
    expect(beforeFunctions).not.toMatch(/insert\s+into\s+public\.(contacts|contact_merges)/i);
  });

  it("verrouille les deux Contacts dans un ordre déterministe", () => {
    const merge = sqlFunction(
      migration,
      "merge_contacts_with_contact_dates",
      "create or replace function public.merge_draft_into_contact_with_addresses",
    );
    const lock = merge.indexOf("order by contact.id\n  for update");
    const sourceLoad = merge.indexOf("select * into v_source");
    const notes = merge.indexOf("update public.client_notes");

    expect(merge).toContain("p_target_id = p_source_id");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(sourceLoad);
    expect(sourceLoad).toBeLessThan(notes);
  });

  it("écrit la provenance, les dates et toutes les valeurs finales dans la RPC", () => {
    const merge = sqlFunction(
      migration,
      "merge_contacts_with_contact_dates",
      "create or replace function public.merge_draft_into_contact_with_addresses",
    );
    expect(merge).toContain("p_client_provenance text");
    expect(merge).toContain("client_provenance = p_client_provenance");
    expect(merge).toContain("birth_date = p_birth_date");
    expect(merge).toContain("mortgage_renewal_date = p_mortgage_renewal_date");
    for (const assignment of [
      "broker = p_broker",
      "client_type = p_client_type",
      "priority = p_priority",
      "status = p_status",
      "next_follow_up_date = p_next_follow_up_date",
      "google_calendar_event_id = p_google_event_id",
      "google_calendar_event_broker = p_google_event_broker",
    ]) expect(merge).toContain(assignment);
    expect(merge).toContain("p_client_provenance is not null");
  });

  it("conserve les notes, déduplique les Transactions et recalcule last_contact_date", () => {
    const merge = sqlFunction(
      migration,
      "merge_contacts_with_contact_dates",
      "create or replace function public.merge_draft_into_contact_with_addresses",
    );
    expect(merge).toContain("update public.client_notes");
    expect(merge).toContain("set contact_id = p_target_id");
    expect(merge).toContain("insert into public.transaction_contacts");
    expect(merge).toContain("on conflict do nothing");
    expect(merge).toContain("delete from public.transaction_contacts");
    expect(merge).toContain("insert into public.listing_contacts");
    expect(merge).toContain("insert into public.custom_email_campaign_contacts");
    expect(merge).toContain("update public.automatic_email_deliveries");
    expect(merge).toContain("select max(created_at) into v_last_contact");
    expect(merge).toContain("greatest(v_target.last_contact_date, v_source.last_contact_date, v_last_contact)");
  });

  it("sauvegarde les adresses et l’audit avant de supprimer la source en dernier", () => {
    const merge = sqlFunction(
      migration,
      "merge_contacts_with_contact_dates",
      "create or replace function public.merge_draft_into_contact_with_addresses",
    );
    const addressSave = merge.indexOf("public.save_contact_addresses(p_target_id, v_addresses)");
    const audit = merge.indexOf("insert into public.contact_merges");
    const sourceDelete = merge.indexOf("delete from public.contacts");
    const finalReturn = merge.indexOf("return v_result", sourceDelete);

    expect(addressSave).toBeGreaterThanOrEqual(0);
    expect(addressSave).toBeLessThan(audit);
    expect(audit).toBeLessThan(sourceDelete);
    expect(sourceDelete).toBeLessThan(finalReturn);
    expect(merge).not.toContain("when others");
  });

  it("rend également le draft merge entièrement atomique", () => {
    const draft = sqlFunction(
      migration,
      "merge_draft_into_contact_with_addresses",
      "revoke execute on function public.merge_contacts_with_contact_dates",
    );
    const update = draft.indexOf("update public.contacts");
    const provenance = draft.indexOf("client_provenance = v_client_provenance");
    const addressSave = draft.indexOf("public.save_contact_addresses(p_target_id, p_addresses)");
    const audit = draft.indexOf("insert into public.contact_merges");
    const result = draft.indexOf("return v_result");

    expect(update).toBeGreaterThanOrEqual(0);
    expect(update).toBeLessThan(provenance);
    expect(provenance).toBeLessThan(addressSave);
    expect(addressSave).toBeLessThan(audit);
    expect(audit).toBeLessThan(result);
    expect(draft).toContain("client_type = nullif(trim(p_values->>'clientType'), '')::public.client_type");
    expect(draft).toContain("priority = nullif(trim(p_values->>'priority'), '')::public.contact_priority");
    expect(draft).toContain("status = (p_values->>'status')::public.contact_status");
    expect(draft).not.toContain("when others");
  });

  it("ne fait plus aucune écriture provenance ou audit après les RPC côté serveur", () => {
    const existing = service.slice(
      service.indexOf("export async function mergeExistingContacts"),
      service.indexOf("export async function mergeDraftIntoContact"),
    );
    const draft = service.slice(
      service.indexOf("export async function mergeDraftIntoContact"),
      service.indexOf("export async function deleteContactAndCalendar"),
    );

    expect(existing).toContain("p_client_provenance: input.values.clientProvenance");
    expect(existing).not.toContain("provenanceResult");
    expect(draft).not.toContain("provenanceResult");
    expect(draft).not.toContain('.from("contact_merges")');
    expect(draft).not.toContain('.from("contacts").update');
    expect(draft).not.toContain("isAddressHistoryUnavailableError(atomic.error)");
  });

  it("réserve les RPC finales au service_role dans la migration et le schéma", () => {
    for (const source of [migration, schema]) {
      expect(source).toMatch(/public\.broker_assignment\s*,\s*public\.client_type\s*,\s*text\s*,\s*public\.contact_priority/);
      expect(source).toContain("revoke execute on function public.merge_contacts_with_contact_dates");
      expect(source).toContain("grant execute on function public.merge_contacts_with_contact_dates");
      expect(source).toContain("revoke execute on function public.merge_draft_into_contact_with_addresses");
      expect(source).toContain("grant execute on function public.merge_draft_into_contact_with_addresses");
    }
  });
});
