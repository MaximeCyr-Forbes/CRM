import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({ getAdmin: vi.fn() }));
vi.mock("../supabase/server", () => ({ getSupabaseAdmin: supabase.getAdmin }));

import {
  createSupabaseListingRepository,
  LISTING_OWNER_BATCH_SIZE,
  type ListingOwnerRow,
  type ListingRow,
} from "./persistence";

function listingRow(index: number): ListingRow {
  return {
    id: `listing-${String(index).padStart(4, "0")}`,
    civic_number: String(index),
    address: "rue Principale",
    apartment: "",
    city: "Montréal",
    province: "QC",
    postal_code: "H2X 1Y4",
    country: "Canada",
    centris_number: String(20_000_000 + index),
    broker: "maxime",
    status: "active",
    purpose: "sale",
    asking_price: 500_000,
    monthly_rent: null,
    sold_price: null,
    notary_date: null,
    collaborating_broker_name: "",
    property_type: "residential",
    listing_date: "2026-08-01",
    expiration_date: "2027-02-01",
    centris_url: "",
    public_url: "",
    primary_image_url: "",
    general_notes: "",
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-24T12:00:00.000Z",
  };
}

function tableQuery(
  rows: ReadonlyArray<Record<string, unknown>>,
  receivedOwnerBatches: string[][],
) {
  return {
    select: () => {
      let filtered = [...rows];
      const query = {
        eq: (column: string, value: unknown) => {
          filtered = filtered.filter((row) => row[column] === value);
          return query;
        },
        in: (column: string, values: string[]) => {
          receivedOwnerBatches.push([...values]);
          filtered = filtered.filter((row) => values.includes(String(row[column])));
          return query;
        },
        order: () => query,
        range: async (from: number, to: number) => ({
          data: filtered.slice(from, to + 1),
          error: null,
        }),
      };
      return query;
    },
  };
}

describe("pagination du dépôt Listings", () => {
  beforeEach(() => {
    supabase.getAdmin.mockReset();
  });

  it("charge 1100 Listings et tous leurs propriétaires sans troncature", async () => {
    const listingRows = Array.from({ length: 1100 }, (_, index) => listingRow(index));
    const ownerRows: ListingOwnerRow[] = listingRows.map((listing, index) => ({
      listing_id: listing.id,
      contact_id: `contact-${String(index).padStart(4, "0")}`,
      role: "owner",
    }));
    const receivedOwnerBatches: string[][] = [];
    const from = vi.fn((table: string) => tableQuery(
      table === "listings" ? listingRows : ownerRows,
      receivedOwnerBatches,
    ));
    supabase.getAdmin.mockReturnValue({ from });
    const repository = createSupabaseListingRepository();

    const rows = await repository.listRows({});
    const owners = await repository.listOwnerRows(rows.map((row) => row.id));

    expect(rows).toHaveLength(1100);
    expect(owners).toHaveLength(1100);
    expect(new Set(owners.map((owner) => owner.listing_id)).size).toBe(1100);
    expect(Math.max(...receivedOwnerBatches.map((batch) => batch.length))).toBeLessThanOrEqual(LISTING_OWNER_BATCH_SIZE);
  });

  it("pagine aussi plus de 1000 propriétaires dans un même lot d'identifiants", async () => {
    const listingIds = Array.from({ length: 100 }, (_, index) => `listing-${index}`);
    const ownerRows: ListingOwnerRow[] = Array.from({ length: 1100 }, (_, index) => ({
      listing_id: listingIds[index % listingIds.length],
      contact_id: `contact-${index}`,
      role: "owner",
    }));
    const receivedOwnerBatches: string[][] = [];
    supabase.getAdmin.mockReturnValue({
      from: vi.fn(() => tableQuery(ownerRows, receivedOwnerBatches)),
    });

    const owners = await createSupabaseListingRepository().listOwnerRows(listingIds);

    expect(owners).toHaveLength(1100);
    expect(receivedOwnerBatches).toEqual(Array.from({ length: 3 }, () => listingIds));
  });
});
