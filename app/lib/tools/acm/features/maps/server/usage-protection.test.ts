import { describe, expect, it, vi } from "vitest";
import {
  createGoogleMapsUsageGuard,
  GoogleMapsLimitError,
  GoogleMapsProtectionUnavailableError,
  type GoogleMapsReservation,
  type GoogleMapsUsageStore,
} from "./usage-protection";

function storeWithReserve(reserve: GoogleMapsUsageStore["reserve"]): GoogleMapsUsageStore {
  return {
    getGeocodingCache: async () => null,
    putGeocodingCache: async () => undefined,
    recordCacheEvent: async () => undefined,
    recordResult: async () => undefined,
    reserve,
  };
}

describe("garde-fous Google Maps", () => {
  it("bloque le 101e appel quotidien sans appeler Google", async () => {
    let count = 0;
    const store = storeWithReserve(async (_service, dailyLimit): Promise<GoogleMapsReservation> => {
      if (count >= dailyLimit) return { allowed: false, reason: "daily_limit", dailyCount: count };
      count += 1;
      return { allowed: true, reason: null, dailyCount: count };
    });
    const guard = createGoogleMapsUsageGuard(store);
    for (let index = 0; index < 100; index += 1) await guard.reserve("geocoding");
    await expect(guard.reserve("geocoding")).rejects.toMatchObject({ reason: "daily_limit" });
    expect(count).toBe(100);
  });

  it("bloque les appels supplémentaires à la limite minute", async () => {
    const reserve = vi.fn(async (): Promise<GoogleMapsReservation> => ({ allowed: false, reason: "minute_limit", minuteCount: 20 }));
    const guard = createGoogleMapsUsageGuard(storeWithReserve(reserve));
    await expect(guard.reserve("geocoding")).rejects.toBeInstanceOf(GoogleMapsLimitError);
    expect(reserve).toHaveBeenCalledWith("geocoding", 100, 20);
  });

  it("bloque immédiatement un circuit ouvert", async () => {
    const guard = createGoogleMapsUsageGuard(storeWithReserve(async (): Promise<GoogleMapsReservation> => ({ allowed: false, reason: "circuit_open" })));
    await expect(guard.reserve("static_map")).rejects.toMatchObject({ service: "static_map", reason: "circuit_open" });
  });

  it("échoue fermé lorsque le compteur partagé est indisponible", async () => {
    const guard = createGoogleMapsUsageGuard(storeWithReserve(async () => { throw new Error("offline"); }));
    await expect(guard.reserve("geocoding")).rejects.toBeInstanceOf(GoogleMapsProtectionUnavailableError);
  });
});
