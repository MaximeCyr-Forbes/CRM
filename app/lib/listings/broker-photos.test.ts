import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LISTING_STATUSES, type ListingBroker, type ListingStatus } from "../../data/listing-types";
import { BROKER_PHOTOS, LISTING_BROKER_PHOTOS, listingBrokerPhoto } from "./broker-photos";

const root = process.cwd();

function listing(broker: ListingBroker, status: ListingStatus = "active") {
  return { broker, status, primaryImageUrl: "https://example.test/propriete.jpg" };
}

describe("photos des courtiers responsables des Listings", () => {
  it("mappe exactement chaque courtier vers son portrait", () => {
    expect(BROKER_PHOTOS).toEqual({
      france: "/brokers/france.jpg",
      maxime: "/brokers/maxime.jpg",
      sandrine: "/brokers/sandrine.jpg",
    });
    expect(LISTING_BROKER_PHOTOS).toBe(BROKER_PHOTOS);
    expect(listingBrokerPhoto(listing("maxime"))).toBe("/brokers/maxime.jpg");
    expect(listingBrokerPhoto(listing("france"))).toBe("/brokers/france.jpg");
    expect(listingBrokerPhoto(listing("sandrine"))).toBe("/brokers/sandrine.jpg");
  });

  it("inclut les trois fichiers statiques optimisés dans le repository", () => {
    for (const photo of Object.values(LISTING_BROKER_PHOTOS)) {
      expect(existsSync(resolve(root, `public${photo}`))).toBe(true);
    }
  });

  it("conserve la photo de Maxime pour tous les statuts", () => {
    for (const status of LISTING_STATUSES) {
      expect(listingBrokerPhoto(listing("maxime", status))).toBe("/brokers/maxime.jpg");
    }
  });

  it("actualise la photo uniquement lorsque le courtier responsable change", () => {
    const current = listing("france", "sold");
    expect(listingBrokerPhoto(current)).toBe("/brokers/france.jpg");
    current.broker = "sandrine";
    expect(listingBrokerPhoto(current)).toBe("/brokers/sandrine.jpg");
  });

  it("ListingMedia dérive sa source du broker et ignore primaryImageUrl", () => {
    const media = readFileSync(resolve(root, "app/components/listing-media.tsx"), "utf8");
    expect(media).toContain("listingBrokerPhoto(listing)");
    expect(media).toContain("listing-broker-photo-${listing.broker}");
    expect(media).not.toContain("listing.primaryImageUrl");
    expect(media).toContain("courtier responsable du Listing");
  });

  it("réutilise les mêmes portraits dans les paramètres Google Agenda", () => {
    const settings = readFileSync(resolve(root, "app/settings/page.tsx"), "utf8");
    const styles = readFileSync(resolve(root, "app/globals.css"), "utf8");
    expect(settings).toContain("BROKER_PHOTOS[connection.broker]");
    expect(settings).toContain('alt=""');
    expect(settings).not.toContain("calendar-broker-mark");
    expect(styles).toContain(".calendar-broker-photo-france");
    expect(styles).toContain(".calendar-broker-photo-maxime");
    expect(styles).toContain(".calendar-broker-photo-sandrine");
    expect(styles).toContain("object-fit: cover");
  });
});
