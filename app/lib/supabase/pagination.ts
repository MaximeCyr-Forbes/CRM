export const SUPABASE_PAGE_SIZE = 500;

export type SupabaseStableOrder = {
  column: string;
  ascending: boolean;
};

export type SupabaseOrderedRangeQuery<T> = {
  order: (
    column: string,
    options: { ascending: boolean },
  ) => SupabaseOrderedRangeQuery<T>;
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

export async function listAllSupabaseRows<T>({
  buildQuery,
  orders,
  pageSize = SUPABASE_PAGE_SIZE,
}: {
  buildQuery: () => SupabaseOrderedRangeQuery<T>;
  orders: ReadonlyArray<SupabaseStableOrder>;
  pageSize?: number;
}) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("La taille de page Supabase doit être un entier positif.");
  }
  if (orders.length === 0) {
    throw new Error("Un ordre stable est requis pour paginer les données Supabase.");
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = buildQuery();
    for (const order of orders) {
      query = query.order(order.column, { ascending: order.ascending });
    }
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function mapWithConcurrency<T, TResult>(
  values: ReadonlyArray<T>,
  concurrency: number,
  mapper: (value: T, index: number) => Promise<TResult>,
) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("La concurrence doit être un entier positif.");
  }
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await mapper(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
