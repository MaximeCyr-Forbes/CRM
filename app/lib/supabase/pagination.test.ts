import { describe, expect, it } from "vitest";
import {
  listAllSupabaseRows,
  mapWithConcurrency,
  type SupabaseOrderedRangeQuery,
} from "./pagination";

function paginatedQuery<T>(
  pages: ReadonlyArray<{ data: T[] | null; error: unknown }>,
  orders: Array<Array<{ column: string; ascending: boolean }>>,
  ranges: Array<[number, number]>,
) {
  let pageIndex = 0;
  return () => {
    const pageOrders: Array<{ column: string; ascending: boolean }> = [];
    orders.push(pageOrders);
    const query: SupabaseOrderedRangeQuery<T> = {
      order(column, options) {
        pageOrders.push({ column, ascending: options.ascending });
        return query;
      },
      async range(from, to) {
        ranges.push([from, to]);
        return pages[pageIndex++] ?? { data: [], error: null };
      },
    };
    return query;
  };
}

describe("pagination complète Supabase", () => {
  it("réunit 2237 lignes réparties sur trois pages", async () => {
    const pages = [1000, 1000, 237].map((count, page) => ({
      data: Array.from({ length: count }, (_, index) => ({ id: `${page}-${index}` })),
      error: null,
    }));
    const orders: Array<Array<{ column: string; ascending: boolean }>> = [];
    const ranges: Array<[number, number]> = [];

    const result = await listAllSupabaseRows({
      buildQuery: paginatedQuery(pages, orders, ranges),
      orders: [
        { column: "updated_at", ascending: false },
        { column: "id", ascending: false },
      ],
      pageSize: 1000,
    });

    expect(result).toHaveLength(2237);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(orders).toEqual(Array.from({ length: 3 }, () => [
      { column: "updated_at", ascending: false },
      { column: "id", ascending: false },
    ]));
  });

  it("effectue la page vide nécessaire lorsqu’une page est exactement pleine", async () => {
    const orders: Array<Array<{ column: string; ascending: boolean }>> = [];
    const ranges: Array<[number, number]> = [];
    const result = await listAllSupabaseRows({
      buildQuery: paginatedQuery([
        { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null },
        { data: [], error: null },
      ], orders, ranges),
      orders: [{ column: "id", ascending: true }],
      pageSize: 500,
    });

    expect(result).toHaveLength(500);
    expect(ranges).toEqual([[0, 499], [500, 999]]);
  });

  it("propage une erreur intermédiaire sans retourner de résultat partiel", async () => {
    const technicalError = new Error("page 2 indisponible");
    await expect(listAllSupabaseRows({
      buildQuery: paginatedQuery([
        { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null },
        { data: null, error: technicalError },
      ], [], []),
      orders: [{ column: "id", ascending: true }],
      pageSize: 500,
    })).rejects.toBe(technicalError);
  });

  it("borne le nombre de traitements concurrents", async () => {
    let active = 0;
    let maximum = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maximum).toBeLessThanOrEqual(2);
  });
});
