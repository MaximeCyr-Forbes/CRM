import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = "20260824233000_make_transaction_writes_atomic.sql";
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");
const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const service = readFileSync(resolve(process.cwd(), "app/lib/transactions/server-service.ts"), "utf8");
const context = readFileSync(resolve(process.cwd(), "app/transactions-context.tsx"), "utf8");
const route = readFileSync(resolve(process.cwd(), "app/api/transactions/route.ts"), "utf8");

function sqlFunction(source: string, name: string, nextMarker: string) {
  const start = source.indexOf(`create or replace function public.${name}`);
  const end = source.indexOf(nextMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("écritures atomiques des Transactions", () => {
  it("ajoute une creation_key nullable protégée par un index unique partiel", () => {
    expect(migration).toContain("add column if not exists creation_key uuid");
    expect(schema).toContain("creation_key uuid");
    for (const source of [migration, schema]) {
      expect(source).toContain("transactions_creation_key_unique_idx");
      expect(source).toContain("where creation_key is not null");
    }
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/delete\s+from\s+public\.transactions|truncate\s+public\.transactions/i);
    const listingsTable = schema.slice(
      schema.indexOf("create table if not exists public.listings"),
      schema.indexOf("create table if not exists public.listing_contacts"),
    );
    const transactionsTable = schema.slice(
      schema.indexOf("create table if not exists public.transactions"),
      schema.indexOf("create or replace function public.create_transaction_from_listing_offer"),
    );
    expect(listingsTable).not.toContain("creation_key");
    expect(transactionsTable).toContain("creation_key uuid");
  });

  it("valide tous les Contacts avant le create et rend la création idempotente", () => {
    const create = sqlFunction(
      migration,
      "create_transaction_with_contacts",
      "create or replace function public.update_transaction_with_contacts",
    );
    const contactValidation = create.indexOf("raise exception 'Contact lié invalide.'");
    const transactionInsert = create.indexOf("insert into public.transactions");
    const contactInsert = create.indexOf("insert into public.transaction_contacts");

    expect(contactValidation).toBeGreaterThanOrEqual(0);
    expect(contactValidation).toBeLessThan(transactionInsert);
    expect(transactionInsert).toBeLessThan(contactInsert);
    expect(create).toContain("select distinct requested_id as contact_id");
    expect(create).toContain("on conflict (creation_key) where creation_key is not null do nothing");
    expect(create).toContain("where creation_key = p_creation_key");
    expect(create).toContain("coalesce(p_contact_ids, array[]::uuid[])");
  });

  it("verrouille et valide l’update avant toute modification", () => {
    const update = sqlFunction(
      migration,
      "update_transaction_with_contacts",
      "revoke execute on function public.create_transaction_with_contacts",
    );
    const lock = update.indexOf("for update");
    const finalizedGuard = update.indexOf("v_transaction.sale_finalized_at is not null");
    const contactValidation = update.indexOf("raise exception 'Contact lié invalide.'");
    const transactionUpdate = update.indexOf("update public.transactions");
    const contactDelete = update.indexOf("delete from public.transaction_contacts");

    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(finalizedGuard);
    expect(finalizedGuard).toBeLessThan(contactValidation);
    expect(contactValidation).toBeLessThan(transactionUpdate);
    expect(transactionUpdate).toBeLessThan(contactDelete);
    expect(update).toContain("v_transaction.purchase_finalized_at is not null");
    expect(update).toContain("if p_contact_ids is not null then");
    expect(update).toContain("unnest(p_contact_ids)");
    expect(update).not.toContain("listing_transaction_links");
  });

  it("réserve les RPC au service_role", () => {
    for (const signature of [
      "public.create_transaction_with_contacts(jsonb, uuid[], uuid)",
      "public.update_transaction_with_contacts(uuid, jsonb, uuid[])",
    ]) {
      expect(migration).toContain(`revoke execute on function ${signature}`);
      expect(migration).toContain(`grant execute on function ${signature}`);
      expect(schema).toContain(`grant execute on function ${signature}`);
    }
  });

  it("ne conserve aucune séquence manuelle dans createTransaction ou updateTransaction", () => {
    const create = service.slice(
      service.indexOf("export async function createTransaction"),
      service.indexOf("export async function updateTransaction"),
    );
    const update = service.slice(
      service.indexOf("export async function updateTransaction"),
      service.indexOf("export async function completeTransactionSale"),
    );

    expect(create).toContain('rpc("create_transaction_with_contacts"');
    expect(update).toContain('rpc("update_transaction_with_contacts"');
    for (const source of [create, update]) {
      expect(source).not.toContain('.from("transactions")');
      expect(source).not.toContain('.from("transaction_contacts")');
    }
  });

  it("conserve une même clé de création pendant la tentative envoyée à l’API", () => {
    expect(context).toContain("const creationKey = draft.creationKey ?? crypto.randomUUID();");
    const editor = readFileSync(resolve(process.cwd(), "app/components/transaction-editor-modal.tsx"), "utf8");
    expect(editor).toContain("const [creationKey] = useState(() => crypto.randomUUID());");
    expect(context).toContain('{ action: "create", draft, creationKey }');
    expect(route).toContain("createTransaction(draft, body.creationKey as string | undefined)");
    expect(service).toContain("creationKey = crypto.randomUUID()");
  });
});
