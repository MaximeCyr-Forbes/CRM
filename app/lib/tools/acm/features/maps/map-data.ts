import type { ParsedProperty, PropertyCoordinates } from "@/app/lib/tools/acm/types";
import { isReusableGoogleGeo } from "./geocoding";

export interface ComparableMapEntry {
  coordinates: PropertyCoordinates | null;
  markerLabel: string;
  property: ParsedProperty;
  role: string;
  isSubject: boolean;
}

export function createComparableMapEntries(subject: ParsedProperty, comparables: ParsedProperty[]): ComparableMapEntry[] {
  return [subject, ...comparables].map((property, index) => ({
    property,
    isSubject: index === 0,
    role: index === 0 ? "Sujet" : `Comparable ${index}`,
    markerLabel: index === 0 ? "S" : String(index),
    coordinates: isReusableGoogleGeo(property.data)
      ? { latitude: property.data.geo.latitude, longitude: property.data.geo.longitude }
      : null,
  }));
}
