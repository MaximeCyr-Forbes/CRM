import { describe, expect, it, vi } from "vitest";
import { createGoogleGeocoder } from "./google";

const input = { address: "249 14e Avenue", city: "Deux-Montagnes", postalCode: "J7R 3W3" };

function googleResponse() {
  return {
    status: "OK",
    results: [{
      address_components: [
        { long_name: "249", short_name: "249", types: ["street_number"] },
        { long_name: "14e Avenue", short_name: "14e Av", types: ["route"] },
        { long_name: "Deux-Montagnes", short_name: "Deux-Montagnes", types: ["locality", "political"] },
        { long_name: "Québec", short_name: "QC", types: ["administrative_area_level_1", "political"] },
        { long_name: "Canada", short_name: "CA", types: ["country", "political"] },
        { long_name: "J7R 3W3", short_name: "J7R 3W3", types: ["postal_code"] },
      ],
      formatted_address: "249 14e Avenue, Deux-Montagnes, QC J7R 3W3, Canada",
      geometry: { location: { lat: 45.534, lng: -73.901 }, location_type: "ROOFTOP" },
      place_id: "google-place-249",
      types: ["street_address"],
    }],
  };
}

describe("client Google Geocoding", () => {
  it("envoie l’adresse complète avec les paramètres régionaux sans exposer la clé dans les données", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(googleResponse())));
    const geocode = createGoogleGeocoder({ apiKey: "server-test-key", fetcher, now: () => new Date("2026-09-01T13:00:00Z") });
    await expect(geocode(input)).resolves.toMatchObject({
      geo: {
        provider: "google",
        latitude: 45.534,
        longitude: -73.901,
        placeId: "google-place-249",
        geocodedAt: "2026-09-01T13:00:00.000Z",
      },
    });
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.searchParams.get("address")).toContain("QC J7R 3W3");
    expect(url.searchParams.get("language")).toBe("fr");
    expect(url.searchParams.get("region")).toBe("ca");
  });

  it("ne réessaie pas une adresse sans résultat", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] })));
    const location = await createGoogleGeocoder({ apiKey: "server-test-key", fetcher })(input);
    expect(location).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("effectue un seul retry sur une erreur serveur temporaire", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(googleResponse())));
    const beforeRequest = vi.fn(async () => undefined);
    const recordResult = vi.fn(async () => undefined);
    await expect(createGoogleGeocoder({
      apiKey: "server-test-key",
      fetcher,
      protection: { beforeRequest, recordResult },
    })(input)).resolves.toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(beforeRequest).toHaveBeenCalledTimes(2);
  });

  it("ne retry pas une réponse de quota", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    const recordResult = vi.fn(async () => undefined);
    await expect(createGoogleGeocoder({
      apiKey: "server-test-key",
      fetcher,
      protection: { beforeRequest: async () => undefined, recordResult },
    })(input)).rejects.toThrow(/quota/i);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(recordResult).toHaveBeenCalledWith(true);
  });

  it("déduplique deux demandes simultanées pour la même adresse", async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify(googleResponse()));
    });
    const geocode = createGoogleGeocoder({ apiKey: "server-test-key", fetcher });
    const [first, second] = await Promise.all([geocode(input), geocode(input)]);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("échoue proprement lorsqu’aucune clé serveur n’est configurée", async () => {
    const fetcher = vi.fn();
    await expect(createGoogleGeocoder({ apiKey: "", fetcher })(input)).rejects.toThrow(/not configured/i);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
