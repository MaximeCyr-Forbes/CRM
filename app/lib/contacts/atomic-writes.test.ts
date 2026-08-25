import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260825120000_make_contact_writes_atomic.sql";
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const route = readFileSync(resolve(process.cwd(), "app/api/crm/data/route.ts"), "utf8");
const context = readFileSync(resolve(process.cwd(), "app/crm-data-context.tsx"), "utf8");
const contactsPage = readFileSync(resolve(process.cwd(), "app/contacts/page.tsx"), "utf8");

function sqlFunction(source: string, name: string, nextMarker: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  const end = source.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function actionSource(action: string, nextAction: string) {
  const start = route.indexOf(`if (body.action === "${action}")`);
  const end = nextAction === "__end__"
    ? route.indexOf('return Response.json({ error: "Action inconnue."', start)
    : route.indexOf(`if (body.action === "${nextAction}")`, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return route.slice(start, end);
}

describe("écritures atomiques des Contacts", () => {
  it("ajoute une creation_key nullable protégée par un index unique partiel", () => {
    for (const source of [migration, schema]) {
      expect(source).toContain("add column if not exists creation_key uuid");
      expect(source).toContain("contacts_creation_key_unique_idx");
      expect(source).toContain("where creation_key is not null");
    }
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/delete\s+from\s+public\.contacts|truncate\s+public\.(contacts|contact_addresses|client_notes)/i);
  });

  it("crée le Contact et ses adresses dans une seule fonction idempotente", () => {
    const create = sqlFunction(
      migration,
      "create_manual_contact_with_addresses",
      "create or replace function public.update_contact_with_addresses",
    );
    const insert = create.indexOf("insert into public.contacts");
    const addresses = create.indexOf("public.save_contact_addresses(v_contact.id, p_addresses)");

    expect(create).toContain("where creation_key = p_creation_key");
    expect(create).toContain("on conflict (creation_key) where creation_key is not null do nothing");
    expect(insert).toBeGreaterThanOrEqual(0);
    expect(addresses).toBeGreaterThan(insert);
    expect(create).not.toContain("exception when");
  });

  it("rend un échec d’adresse fatal afin que la création soit rollbackée", () => {
    const create = sqlFunction(
      migration,
      "create_manual_contact_with_addresses",
      "create or replace function public.update_contact_with_addresses",
    );
    expect(create).toContain("from public.save_contact_addresses(v_contact.id, p_addresses)");
    expect(create).not.toContain("contact_addresses.*indisponible");
    expect(create).not.toContain("when others");
  });

  it("verrouille l’update et distingue NULL de [] pour les adresses", () => {
    const update = sqlFunction(
      migration,
      "update_contact_with_addresses",
      "create or replace function public.add_contact_note",
    );
    const lock = update.indexOf("for update");
    const contactUpdate = update.indexOf("update public.contacts");
    const addressSave = update.indexOf("public.save_contact_addresses(p_contact_id, p_addresses)");

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(contactUpdate);
    expect(contactUpdate).toBeLessThan(addressSave);
    expect(update).toContain("if p_addresses is not null then");
    expect(update).toContain("broker is distinct from v_next_broker");
    expect(update).toContain("'pending'::public.calendar_sync_status");
    expect(update).not.toContain("when others");
  });

  it("ajoute une note et last_contact_date sous le même verrou Contact", () => {
    const add = sqlFunction(
      migration,
      "add_contact_note",
      "create or replace function public.delete_contact_note",
    );
    const lock = add.indexOf("for update");
    const insert = add.indexOf("insert into public.client_notes");
    const update = add.indexOf("update public.contacts");

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(insert);
    expect(insert).toBeLessThan(update);
    expect(add).toContain("v_content := trim(coalesce(p_content, ''))");
    expect(add).toContain("char_length(v_content) > 10000");
    expect(add).toContain("when v_contact.broker in ('france', 'maxime', 'sandrine')");
    expect(add).not.toContain("when others");
  });

  it("supprime une note et recalcule atomiquement la dernière date, y compris NULL", () => {
    const remove = sqlFunction(
      migration,
      "delete_contact_note",
      "revoke execute on function public.create_manual_contact_with_addresses",
    );
    const noteLock = remove.indexOf("from public.client_notes");
    const contactLock = remove.indexOf("from public.contacts");
    const deletion = remove.indexOf("delete from public.client_notes");
    const maximum = remove.indexOf("select max(created_at) into v_last_contact_date");
    const update = remove.indexOf("update public.contacts");

    expect(noteLock).toBeGreaterThanOrEqual(0);
    expect(noteLock).toBeLessThan(contactLock);
    expect(contactLock).toBeLessThan(deletion);
    expect(deletion).toBeLessThan(maximum);
    expect(maximum).toBeLessThan(update);
    expect(remove).toContain("set last_contact_date = v_last_contact_date");
    expect(remove).not.toContain("when others");
  });

  it("réserve les quatre RPC au service_role", () => {
    for (const signature of [
      "public.create_manual_contact_with_addresses(jsonb, jsonb, uuid)",
      "public.update_contact_with_addresses(uuid, jsonb, jsonb)",
      "public.add_contact_note(uuid, text, public.broker_assignment, timestamptz)",
      "public.delete_contact_note(uuid)",
    ]) {
      expect(migration).toContain(`revoke execute on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
      expect(schema).toContain(`revoke execute on function ${signature}`);
      expect(schema).toContain(`grant execute on function ${signature}`);
    }
  });

  it("retire les anciennes séquences multi-écritures de la route CRM", () => {
    const create = actionSource("addManualContact", "importContacts");
    const update = actionSource("updateContact", "addNote");
    const addNote = actionSource("addNote", "updateNote");
    const deleteNote = actionSource("deleteNote", "__end__");

    expect(create).toContain('rpc("create_manual_contact_with_addresses"');
    expect(update).toContain('rpc("update_contact_with_addresses"');
    expect(addNote).toContain('rpc("add_contact_note"');
    expect(deleteNote).toContain('rpc("delete_contact_note"');
    for (const source of [create, update, addNote, deleteNote]) {
      expect(source).not.toContain('.from("contacts")');
    }
    expect(create).not.toContain('.from("contacts").insert');
    expect(update).not.toContain('rpc("save_contact_addresses"');
    expect(addNote).not.toContain('.from("client_notes").insert');
    expect(deleteNote).not.toContain('.from("client_notes").delete');
  });

  it("conserve une même clé tant que le formulaire manuel reste ouvert", () => {
    expect(context).toContain("creationKey: defaults?.creationKey ?? crypto.randomUUID()");
    expect(contactsPage).toContain("const [manualCreationKey, setManualCreationKey]");
    expect(contactsPage).toContain("setManualCreationKey(crypto.randomUUID())");
    expect(contactsPage).toContain("creationKey,");
    expect(contactsPage).toContain("setManualCreationKey(null)");
  });
});
