import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_PROVENANCES,
  CLIENT_PROVENANCE_LABELS,
  normalizeClientProvenance,
} from "./contact-types";

const root = process.cwd();

function source(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("provenance commerciale du client", () => {
  it("expose exactement les quatre valeurs stables et leurs libellés français", () => {
    expect(CLIENT_PROVENANCES).toEqual(["friend_family", "referral", "prospecting", "confia"]);
    expect(CLIENT_PROVENANCE_LABELS).toEqual({
      friend_family: "Ami/famille",
      referral: "Référence",
      prospecting: "Prospection",
      confia: "Confia",
    });
  });

  it.each([
    [null, null],
    ["", null],
    ["friend_family", "friend_family"],
    ["referral", "referral"],
    ["prospecting", "prospecting"],
    ["confia", "confia"],
  ])("normalise %s vers %s", (input, expected) => {
    expect(normalizeClientProvenance(input)).toBe(expected);
  });

  it("refuse toute valeur non autorisée", () => {
    expect(() => normalizeClientProvenance("csv")).toThrow("Provenance du client invalide");
    expect(() => normalizeClientProvenance("manual")).toThrow("Provenance du client invalide");
    expect(() => normalizeClientProvenance(undefined)).toThrow("Provenance du client invalide");
  });

  it("sépare la provenance commerciale de la source technique", () => {
    const context = source("app/crm-data-context.tsx");
    const api = source("app/api/crm/data/route.ts");
    const atomicMigration = source("supabase/migrations/20260825120000_make_contact_writes_atomic.sql");
    expect(context).toContain("clientProvenance: row.client_provenance ?? null");
    expect(atomicMigration).toContain("'manual',");
    expect(api).toContain("client_provenance: normalizeClientProvenance(values.clientProvenance)");
    expect(api).toContain("client_provenance: null");
  });

  it("affiche et édite la provenance dans les bons modes de la fiche Contact", () => {
    const editor = source("app/components/contact-editor-modal.tsx");
    const profile = source("app/contacts/[contactId]/page.tsx");
    expect(editor).toContain("const showResponsibility = mode === \"full\" || mode === \"responsibility\"");
    expect(editor).toContain("Provenance du client");
    expect(editor.indexOf("Provenance du client")).toBeGreaterThan(editor.indexOf("showResponsibility &&"));
    expect(profile).toContain("Provenance · {CLIENT_PROVENANCE_LABELS[contact.clientProvenance]}");
    expect(profile).toContain('"Non renseignée"');
    expect(profile).not.toContain("Source · {contact.source}");
  });

  it("propose le même référentiel dans les créations Contacts, Transactions et Listings", () => {
    for (const path of [
      "app/contacts/page.tsx",
      "app/components/transaction-editor-modal.tsx",
      "app/components/listing-editor-modal.tsx",
    ]) {
      const form = source(path);
      expect(form).toContain("CLIENT_PROVENANCES.map");
      expect(form).toContain("CLIENT_PROVENANCE_LABELS[provenance]");
      expect(form).toContain("Non renseignée");
    }
  });

  it("conserve la provenance choisie pendant une fusion sans changer les critères de doublon", () => {
    const modal = source("app/components/duplicate-resolution-modal.tsx");
    const service = source("app/lib/contacts/server-service.ts");
    const duplicateLogic = source("app/lib/contact-normalization.ts");
    expect(modal).toContain("Provenance du client");
    expect(modal).toContain("clientProvenance,");
    expect(service).toContain("client_provenance: input.values.clientProvenance");
    expect(service).toContain("client_provenance: values.clientProvenance");
    expect(duplicateLogic).not.toContain("clientProvenance");
  });

  it("n’infère aucune provenance dans les parseurs CSV ou vCard", () => {
    const importer = source("app/lib/contact-import.ts");
    expect(importer).not.toContain("clientProvenance");
    expect(importer).not.toContain("client_provenance");
  });

  it("décrit une migration additive, nullable et protégée par le nombre de Contacts", () => {
    const migration = source("supabase/migrations/20260820213000_add_contact_client_provenance.sql");
    expect(migration).toContain("add column if not exists client_provenance text");
    expect(migration).toContain("contacts_client_provenance_check");
    for (const value of CLIENT_PROVENANCES) expect(migration).toContain(`'${value}'`);
    expect(migration).toContain("crm_client_provenance_contact_count");
    expect(migration).toContain("if v_before <> v_after then");
    expect(migration).not.toMatch(/delete\s+from\s+public\.contacts/i);
    expect(migration).not.toMatch(/truncate\s+public\.contacts/i);
    expect(migration).not.toMatch(/drop\s+table\s+public\.contacts/i);
    expect(migration).not.toMatch(/update\s+public\.contacts/i);
  });
});
