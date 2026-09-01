import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_DRIVE_SEARCH_TIMEOUT_MESSAGE,
  GoogleDriveSearchTimeoutError,
  requestGoogleDriveSearch,
} from "./search-client";

describe("client de recherche Google Drive", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("annule un backend lent et retourne une erreur explicite", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));

    const search = requestGoogleDriveSearch("maxime", "normandie", {
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 50,
    });
    const rejection = expect(search).rejects.toEqual(expect.objectContaining({
      name: "GoogleDriveSearchTimeoutError",
      message: GOOGLE_DRIVE_SEARCH_TIMEOUT_MESSAGE,
    } satisfies Partial<GoogleDriveSearchTimeoutError>));
    await vi.advanceTimersByTimeAsync(50);

    await rejection;
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("relaie l’annulation d’une recherche remplacée", async () => {
    const caller = new AbortController();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const search = requestGoogleDriveSearch("france", "normandie", {
      fetchImpl: fetchImpl as typeof fetch,
      signal: caller.signal,
    });

    caller.abort();

    await expect(search).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
