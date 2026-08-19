import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  LISTING_BROKERS,
  LISTING_PROPERTY_TYPE_LABELS,
  LISTING_PROPERTY_TYPES,
  LISTING_PURPOSE_LABELS,
  LISTING_PURPOSES,
  LISTING_STATUSES,
  LISTING_STATUS_LABELS,
  type Listing,
  type ListingDraft,
  type ListingPropertyType,
  type ListingPurpose,
  type ListingStatus,
} from "./listing-types";

const root = process.cwd();
const migrationName = "20260819210000_create_listings_foundation.sql";
const migration = readFileSync(resolve(root, "supabase", "migrations", migrationName), "utf8");
const schema = readFileSync(resolve(root, "supabase", "schema.sql"), "utf8");

describe("types Listings", () => {
  it("déclare tous les statuts et leurs libellés français", () => {
    expect(LISTING_STATUSES).toEqual([
      "preparation",
      "coming_soon",
      "active",
      "offer_received",
      "conditional",
      "sold",
      "rented",
      "expired",
      "withdrawn",
    ]);
    expect(LISTING_STATUS_LABELS).toEqual({
      preparation: "Préparation",
      coming_soon: "À venir",
      active: "Actif",
      offer_received: "Offre reçue",
      conditional: "Conditionnel",
      sold: "Vendu",
      rented: "Loué",
      expired: "Expiré",
      withdrawn: "Retiré",
    });
    expectTypeOf<ListingStatus>().toEqualTypeOf<(typeof LISTING_STATUSES)[number]>();
  });

  it("déclare les finalités Vente et Location avec leurs libellés français", () => {
    expect(LISTING_PURPOSES).toEqual(["sale", "rental"]);
    expect(LISTING_PURPOSE_LABELS).toEqual({ sale: "Vente", rental: "Location" });
    expectTypeOf<ListingPurpose>().toEqualTypeOf<"sale" | "rental">();
  });

  it("déclare tous les types de propriétés et leurs libellés français", () => {
    expect(LISTING_PROPERTY_TYPES).toEqual([
      "residential",
      "condo",
      "income_property",
      "land",
      "commercial",
      "other",
    ]);
    expect(LISTING_PROPERTY_TYPE_LABELS).toEqual({
      residential: "Résidentiel",
      condo: "Copropriété",
      income_property: "Immeuble à revenus",
      land: "Terrain",
      commercial: "Commercial",
      other: "Autre",
    });
    expectTypeOf<ListingPropertyType>().toEqualTypeOf<(typeof LISTING_PROPERTY_TYPES)[number]>();
  });

  it("limite le courtier d’un Listing aux trois courtiers attribués", () => {
    expect(LISTING_BROKERS).toEqual(["france", "maxime", "sandrine"]);
    expectTypeOf<Listing["broker"]>().toEqualTypeOf<"france" | "maxime" | "sandrine">();
  });

  it("définit la structure complète de ListingDraft sans champs persistés", () => {
    const draft = {
      civicNumber: "150",
      address: "avenue Léo-Lacombe",
      apartment: "",
      city: "Deux-Montagnes",
      province: "QC",
      postalCode: "J7R 3W7",
      country: "Canada",
      centrisNumber: "12345678",
      broker: "maxime",
      status: "preparation",
      purpose: "sale",
      askingPrice: 649000,
      monthlyRent: null,
      propertyType: "residential",
      listingDate: "2026-08-19",
      expirationDate: "2027-02-19",
      centrisUrl: "https://centris.ca/example",
      publicUrl: "https://example.ca/listing",
      primaryImageUrl: "https://example.ca/listing.jpg",
      generalNotes: "Préparation de la mise en marché.",
      ownerContactIds: ["contact-1", "contact-2"],
    } satisfies ListingDraft;

    expect(Object.keys(draft).sort()).toEqual([
      "address",
      "apartment",
      "askingPrice",
      "broker",
      "centrisNumber",
      "centrisUrl",
      "city",
      "civicNumber",
      "country",
      "expirationDate",
      "generalNotes",
      "listingDate",
      "monthlyRent",
      "ownerContactIds",
      "postalCode",
      "primaryImageUrl",
      "propertyType",
      "province",
      "purpose",
      "publicUrl",
      "status",
    ].sort());
    expectTypeOf(draft).toMatchTypeOf<ListingDraft>();
    expectTypeOf<ListingDraft>().not.toHaveProperty("id");
    expectTypeOf<ListingDraft>().not.toHaveProperty("createdAt");
    expectTypeOf<ListingDraft>().not.toHaveProperty("updatedAt");
  });
});

describe("fondations SQL Listings", () => {
  it("crée uniquement les deux tables Listings demandées avec leurs relations", () => {
    const createdTables = [...migration.matchAll(/create table if not exists public\.(\w+)/gi)].map((match) => match[1]);
    expect(createdTables).toEqual(["listings", "listing_contacts"]);
    expect(migration).toContain("references public.listings(id) on delete cascade");
    expect(migration).toContain("references public.contacts(id) on delete cascade");
    expect(migration).toContain("primary key (listing_id, contact_id)");
    expect(migration).toContain("constraint listing_contacts_role_check check (role = 'owner')");
  });

  it("ajoute les contraintes, index, trigger et protections serveur attendus", () => {
    for (const name of [
      "listings_assigned_broker_check",
      "listings_status_check",
      "listings_purpose_check",
      "listings_asking_price_check",
      "listings_monthly_rent_check",
      "listings_property_type_check",
      "listings_date_range_check",
      "listings_centris_number_unique_idx",
      "listings_broker_idx",
      "listings_status_idx",
      "listings_broker_status_idx",
      "listings_updated_at_idx",
      "listing_contacts_contact_idx",
      "listings_set_updated_at",
    ]) {
      expect(migration).toContain(name);
      expect(schema).toContain(name);
    }
    expect(migration).toContain("for each row execute function public.set_updated_at()");
    expect(migration).toContain("alter table public.listings enable row level security");
    expect(migration).toContain("alter table public.listing_contacts enable row level security");
    expect(migration).toContain("revoke all on public.listings from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.listings to service_role");
    expect(migration).toContain("purpose text not null default 'sale'");
    expect(migration).toContain("monthly_rent numeric(14, 2)");
    expect(migration).toContain("'rented'");
    expect(migration).toContain("create or replace function public.create_listing_with_owners");
    expect(migration).toContain("create or replace function public.update_listing_with_owners");
    expect(migration).toContain("grant execute on function public.create_listing_with_owners(jsonb, uuid[]) to service_role");
  });

  it("normalise le numéro Centris non vide dans un index unique partiel", () => {
    expect(migration).toMatch(/create unique index if not exists listings_centris_number_unique_idx/i);
    expect(migration).toContain("upper(regexp_replace(trim(centris_number), '\\s+', '', 'g'))");
    expect(migration).toContain("where length(trim(centris_number)) > 0");
  });

  it("reste additive et ne modifie ni ne supprime aucun contact", () => {
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.contacts\b/i);
    expect(migration).not.toMatch(/\btruncate(?:\s+table)?\s+public\.contacts\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table(?:\s+if\s+exists)?\s+public\.contacts\b/i);
    expect(migration).not.toMatch(/\bupdate\s+public\.contacts\b/i);
    expect(migration).not.toMatch(/\binsert\s+into\s+public\.contacts\b/i);
    expect(migration).not.toMatch(/\balter\s+table\s+public\.contacts\b/i);
  });

  it("active la page d’inventaire et la fiche Listing détaillée", () => {
    expect(existsSync(resolve(root, "app", "listings", "page.tsx"))).toBe(true);
    expect(existsSync(resolve(root, "app", "listings", "[listingId]", "page.tsx"))).toBe(true);
  });
});
