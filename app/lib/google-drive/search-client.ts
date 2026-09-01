import type { CalendarBroker } from "../../data/calendar-types";
import type { GoogleDriveSearchResult } from "../../data/google-drive-types";

export const GOOGLE_DRIVE_SEARCH_TIMEOUT_MS = 12_000;
export const GOOGLE_DRIVE_SEARCH_TIMEOUT_MESSAGE = "La recherche prend trop de temps. Réessayez.";

export type GoogleDriveSearchResponse = {
  results: GoogleDriveSearchResult[];
  truncated: boolean;
  unavailableRootIds: string[];
};

type SearchOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class GoogleDriveSearchTimeoutError extends Error {
  constructor() {
    super(GOOGLE_DRIVE_SEARCH_TIMEOUT_MESSAGE);
    this.name = "GoogleDriveSearchTimeoutError";
  }
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function requestGoogleDriveSearch(
  broker: CalendarBroker,
  query: string,
  options: SearchOptions = {},
): Promise<GoogleDriveSearchResponse> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? GOOGLE_DRIVE_SEARCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  let timedOut = false;
  const abortFromCaller = () => controller.abort();

  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const search = new URLSearchParams({ broker, q: query });
    const response = await fetchImpl(`/api/google-drive/search?${search.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as {
      data?: GoogleDriveSearchResponse;
      error?: string;
    } | null;
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error ?? "Recherche Google Drive impossible.");
    }
    return payload.data;
  } catch (error) {
    if (timedOut) throw new GoogleDriveSearchTimeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
