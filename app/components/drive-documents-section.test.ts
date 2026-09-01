import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("liaisons manuelles Google Drive", () => {
  const component = source("app/components/drive-documents-section.tsx");
  const migration = source("supabase/migrations/20260901160000_link_google_drive_to_crm_entities.sql");

  it("affiche la section sur les Contacts, Listings et Transactions", () => {
    expect(source("app/contacts/[contactId]/page.tsx")).toContain('entityType="contact"');
    expect(source("app/listings/[listingId]/page.tsx")).toContain('entityType="listing"');
    expect(source("app/transactions/[transactionId]/page.tsx")).toContain('entityType="transaction"');
    expect(component).toContain("DOCUMENTS DRIVE");
    expect(component).toContain("LIER UN DOSSIER DRIVE");
  });

  it("permet plusieurs dossiers et retire uniquement le lien CRM", () => {
    expect(component).toContain("links.map");
    expect(component).toContain("RETIRER LE LIEN");
    expect(component).toContain("Le dossier Google Drive reste intact");
    expect(component).toContain("/api/google-drive/entity-links/");
    expect(component).not.toMatch(/files\.(create|update|delete)/);
  });

  it("parcourt exclusivement les racines CRM et leurs descendants", () => {
    expect(component).toContain("/api/google-drive/roots?broker=");
    expect(component).toContain("/api/google-drive/browse?");
    expect(component).not.toContain("pickGoogleDriveFolder");
  });

  it("garantit une seule entité, le bon courtier et les cascades attendues", () => {
    expect(migration).toContain("num_nonnulls(contact_id, listing_id, transaction_id) = 1");
    expect(migration).toContain("foreign key (root_id, broker)");
    expect(migration).toContain("references public.google_drive_roots(id, broker)");
    expect(migration.match(/on delete cascade/g)).toHaveLength(4);
    expect(migration).toContain("google_drive_entity_links_contact_unique_idx");
    expect(migration).toContain("google_drive_entity_links_listing_unique_idx");
    expect(migration).toContain("google_drive_entity_links_transaction_unique_idx");
  });

  it("n’altère aucune donnée existante et reste réservé au serveur", () => {
    expect(migration).not.toMatch(/delete\s+from|truncate|drop\s+table|update\s+public\./i);
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.google_drive_entity_links from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.google_drive_entity_links to service_role");
  });
});
