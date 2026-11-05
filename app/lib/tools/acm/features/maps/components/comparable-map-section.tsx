"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { LoaderCircle, MapPin } from "lucide-react";
import type { ParsedProperty, PropertyGeoData } from "@/app/lib/tools/acm/types";
import { PROPERTY_CATEGORY_LABELS } from "@/app/lib/tools/acm/features/analysis/presentation";
import { formatCmaCurrency } from "@/app/lib/tools/acm/features/analysis/value-presentation";
import {
  buildAddressFingerprint,
  createPropertyGeocodingRequest,
  isValidCoordinates,
  type PropertyGeocodingRequest,
  type ValidatedPropertyLocation,
} from "../geocoding";
import { createGeocodingRequestCache } from "../geocoding-cache";
import { createComparableMapEntries, type ComparableMapEntry } from "../map-data";

interface ComparableMapSectionProps {
  comparables: ParsedProperty[];
  onCoordinatesResolved: (propertyId: string, location: ValidatedPropertyLocation) => void;
  subject: ParsedProperty;
}

let configuredGoogleMapsKey: string | null = null;

function developmentLog(message: string) {
  if (process.env.NODE_ENV === "development") console.info(message);
}

async function loadGoogleMaps() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) throw new Error("Google Maps browser key is not configured");
  if (!configuredGoogleMapsKey) {
    setOptions({ key: apiKey, v: "weekly", language: "fr", region: "CA", authReferrerPolicy: "origin" });
    configuredGoogleMapsKey = apiKey;
  }
  if (configuredGoogleMapsKey !== apiKey) throw new Error("Google Maps was initialized with a different key");
  return importLibrary("maps");
}

async function reserveInteractiveMapLoad() {
  const response = await fetch("/api/tools/acm/maps/client-load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Google Maps interactive load blocked");
}

function popupLine(className: string, value: string): HTMLDivElement {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = value;
  return line;
}

function createPopupContent(entry: ComparableMapEntry): HTMLDivElement {
  const { data } = entry.property;
  const root = document.createElement("div");
  root.className = "comparable-map-popup";
  root.append(popupLine("comparable-map-popup__role", entry.role));
  root.append(popupLine("comparable-map-popup__address", [data.address, data.city].filter(Boolean).join(", ") || "Adresse non détectée"));
  if (data.soldPrice !== undefined) root.append(popupLine("comparable-map-popup__detail", `Vendu : ${formatCmaCurrency(data.soldPrice)}`));
  else if (data.askingPrice !== undefined) root.append(popupLine("comparable-map-popup__detail", `Demandé : ${formatCmaCurrency(data.askingPrice)}`));
  const propertyType = data.propertyType ?? (data.propertyCategory ? PROPERTY_CATEGORY_LABELS[data.propertyCategory] : undefined);
  if (propertyType) root.append(popupLine("comparable-map-popup__detail", propertyType));
  return root;
}

function GoogleComparableMap({ entries }: { entries: ComparableMapEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);
  const locatedEntries = entries.filter((entry) => entry.coordinates !== null);
  const markerSignature = locatedEntries
    .map(({ property, role, markerLabel, coordinates }) => `${property.id}:${role}:${markerLabel}:${coordinates?.latitude}:${coordinates?.longitude}`)
    .join("|");

  useEffect(() => {
    if (!containerRef.current || locatedEntries.length === 0) return;
    let disposed = false;
    let map: google.maps.Map | undefined;
    const markers: google.maps.Marker[] = [];
    const infoWindows: google.maps.InfoWindow[] = [];

    void reserveInteractiveMapLoad().then(loadGoogleMaps).then(({ InfoWindow, Map }) => {
      if (disposed || !containerRef.current) return;
      const firstCoordinates = locatedEntries[0].coordinates!;
      map = new Map(containerRef.current, {
        center: { lat: firstCoordinates.latitude, lng: firstCoordinates.longitude },
        clickableIcons: false,
        fullscreenControl: false,
        mapTypeControl: false,
        streetViewControl: false,
        zoom: 15,
      });
      const bounds = new google.maps.LatLngBounds();

      for (const entry of locatedEntries) {
        const coordinates = entry.coordinates!;
        const position = { lat: coordinates.latitude, lng: coordinates.longitude };
        bounds.extend(position);
        const marker = new google.maps.Marker({
          map,
          position,
          title: `${entry.role} — ${entry.property.data.address ?? "adresse non détectée"}`,
          label: {
            text: entry.markerLabel,
            color: entry.isSubject ? "#ffffff" : "#171717",
            fontFamily: "Arial, sans-serif",
            fontSize: "12px",
            fontWeight: "700",
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: entry.isSubject ? "#171717" : "#ffffff",
            fillOpacity: 1,
            strokeColor: "#171717",
            strokeOpacity: 1,
            strokeWeight: 2,
            scale: 15,
          },
        });
        const infoWindow = new InfoWindow({ content: createPopupContent(entry) });
        marker.addListener("click", () => {
          for (const openWindow of infoWindows) openWindow.close();
          infoWindow.open({ anchor: marker, map });
        });
        markers.push(marker);
        infoWindows.push(infoWindow);
      }

      if (locatedEntries.length === 1) map.setZoom(15);
      else map.fitBounds(bounds, 48);
    }).catch(() => {
      if (!disposed) setLoadError(true);
    });

    return () => {
      disposed = true;
      for (const infoWindow of infoWindows) infoWindow.close();
      for (const marker of markers) marker.setMap(null);
      map = undefined;
    };
  // markerSignature captures every value used to rebuild markers while keeping the effect dependency stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSignature]);

  if (loadError) return <div className="comparable-map__empty">La carte est temporairement indisponible.</div>;
  return <div className="comparable-map__canvas" ref={containerRef} aria-label="Carte Google de la propriété sujet et des comparables" />;
}

const geocodingRequestCache = createGeocodingRequestCache(
  async (input: PropertyGeocodingRequest): Promise<ValidatedPropertyLocation | null> => {
    const fingerprint = buildAddressFingerprint(input)!;
    const response = await fetch("/api/tools/acm/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("Géocodage indisponible");
    const result = await response.json() as { geo?: unknown };
    const geo = result.geo && typeof result.geo === "object" ? result.geo as PropertyGeoData : null;
    const location = geo?.provider === "google" && isValidCoordinates(geo) && geo.addressFingerprint === fingerprint
      ? { geo }
      : null;
    return location;
  },
  developmentLog,
);

async function requestCoordinates(input: PropertyGeocodingRequest): Promise<ValidatedPropertyLocation | null> {
  return geocodingRequestCache.get(input);
}

export function ComparableMapSection({ comparables, onCoordinatesResolved, subject }: ComparableMapSectionProps) {
  const entries = useMemo(() => createComparableMapEntries(subject, comparables), [comparables, subject]);
  const onCoordinatesResolvedRef = useRef(onCoordinatesResolved);
  const [failedPropertyIds, setFailedPropertyIds] = useState<string[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);

  useEffect(() => {
    onCoordinatesResolvedRef.current = onCoordinatesResolved;
  }, [onCoordinatesResolved]);

  const addressCandidates = entries.map((entry) => ({
    entry,
    input: createPropertyGeocodingRequest(entry.property.data),
  }));
  const addressSignature = addressCandidates.map(({ entry, input }) => `${entry.property.id}:${input ? buildAddressFingerprint(input) : ""}`).join("|");

  useEffect(() => {
    let disposed = false;
    for (const { entry, input } of addressCandidates) {
      if (entry.coordinates && input) developmentLog("GOOGLE GEO CACHE HIT");
    }
    const candidates = addressCandidates.filter(({ entry, input }) => !entry.coordinates && input);
    if (candidates.length === 0) return;

    async function geocodeMissingProperties() {
      setIsGeocoding(true);
      for (const { entry, input } of candidates) {
        if (disposed || !input) break;
        try {
          const location = await requestCoordinates(input);
          if (disposed) break;
          if (location) {
            setFailedPropertyIds((current) => current.filter((id) => id !== entry.property.id));
            onCoordinatesResolvedRef.current(entry.property.id, location);
          } else {
            setFailedPropertyIds((current) => current.includes(entry.property.id) ? current : [...current, entry.property.id]);
          }
        } catch {
          if (!disposed) setFailedPropertyIds((current) => current.includes(entry.property.id) ? current : [...current, entry.property.id]);
        }
      }
      if (!disposed) setIsGeocoding(false);
    }

    void geocodeMissingProperties();
    return () => { disposed = true; };
  // Coordinates are intentionally excluded: successful callbacks persist them without restarting the geocoding queue.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressSignature]);

  const locatedCount = entries.filter(({ coordinates }) => coordinates !== null).length;
  const unavailablePropertyIds = new Set([
    ...failedPropertyIds,
    ...addressCandidates.filter(({ entry, input }) => !entry.coordinates && !input).map(({ entry }) => entry.property.id),
  ]);
  return (
    <section className="comparable-map" aria-labelledby="comparable-map-title">
      <header className="comparable-map__header">
        <div>
          <span className="property-results__eyebrow">Proximité géographique</span>
          <h3 id="comparable-map-title">Carte des comparables</h3>
          <p>Visualisez l’emplacement de la propriété sujet et des comparables utilisés dans l’analyse.</p>
        </div>
        <div className="comparable-map__legend" aria-label="Légende de la carte">
          <span><i className="comparable-map__legend-subject">S</i> Sujet</span>
          <span><i>1</i> Comparables</span>
        </div>
      </header>

      {locatedCount > 0 ? (
        <GoogleComparableMap entries={entries} />
      ) : (
        <div className="comparable-map__empty">
          {isGeocoding ? <><LoaderCircle className="spin" size={18} /> Localisation des propriétés…</> : <><MapPin size={18} /> Aucun emplacement disponible.</>}
        </div>
      )}

      <footer className="comparable-map__footer">
        <span>{locatedCount} sur {entries.length} {entries.length === 1 ? "propriété localisée" : "propriétés localisées"}</span>
        {isGeocoding && <span><LoaderCircle className="spin" size={12} /> Géocodage en cours…</span>}
        {!isGeocoding && unavailablePropertyIds.size > 0 && <span>Une ou plusieurs propriétés n’ont pas pu être localisées.</span>}
      </footer>
    </section>
  );
}
