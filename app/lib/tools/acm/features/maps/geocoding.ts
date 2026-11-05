import type { PropertyCoordinates, PropertyData, PropertyGeoData } from "@/app/lib/tools/acm/types";

export interface PropertyGeocodingRequest {
  address: string;
  city?: string;
  postalCode?: string;
}

export interface ValidatedPropertyLocation {
  geo: PropertyGeoData;
}

export interface GoogleAddressComponent {
  long_name?: unknown;
  short_name?: unknown;
  types?: unknown;
}

export interface GoogleGeocodingResult {
  address_components?: unknown;
  formatted_address?: unknown;
  geometry?: unknown;
  partial_match?: unknown;
  place_id?: unknown;
  types?: unknown;
}

export interface GoogleGeocodingResponse {
  results?: unknown;
  status?: unknown;
}

const WATER_OR_VAGUE_TYPES = new Set([
  "airport",
  "country",
  "establishment",
  "locality",
  "natural_feature",
  "park",
  "political",
  "postal_code",
  "route",
]);
const PRECISE_RESULT_TYPES = new Set(["street_address", "premise", "subpremise"]);
const PRECISE_LOCATION_TYPES = new Set(["ROOFTOP", "RANGE_INTERPOLATED"]);

export function normalizeGeocodingText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-CA")
    .replace(/\b(?:rue|avenue|av|boulevard|boul|chemin|ch|route)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function uniqueParts(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  return parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).filter((part) => {
    const normalized = normalizeGeocodingText(part);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).join(", ");
}

export function normalizePostalCode(value: string | undefined): string {
  const compact = value?.replace(/[^a-z0-9]/gi, "").toUpperCase() ?? "";
  return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact;
}

function parseCivicAddress(address: string): { civicNumber: string | null; street: string } {
  const match = address.trim().match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)\s+(.+)$/i);
  return match ? { civicNumber: match[1], street: match[2].trim() } : { civicNumber: null, street: address.trim() };
}

export function createPropertyGeocodingRequest(data: PropertyData): PropertyGeocodingRequest | null {
  const address = data.address?.trim();
  if (!address) return null;
  return {
    address,
    city: data.city?.trim() || undefined,
    postalCode: normalizePostalCode(data.postalCode) || undefined,
  };
}

export function buildGeocodingAddress(data: PropertyData | PropertyGeocodingRequest): string | null {
  const address = data.address?.trim();
  if (!address) return null;
  const postalCode = normalizePostalCode(data.postalCode) || undefined;
  return uniqueParts([address, data.city?.trim() || undefined, postalCode ? `QC ${postalCode}` : "QC", "Canada"]);
}

export function buildGeocodingAttempts(input: PropertyGeocodingRequest): string[] {
  const { civicNumber, street } = parseCivicAddress(input.address);
  const postalCode = normalizePostalCode(input.postalCode) || undefined;
  return [...new Set([
    uniqueParts([input.address, input.city, postalCode ? `QC ${postalCode}` : "QC", "Canada"]),
    uniqueParts([input.address, input.city, "QC", "Canada"]),
    uniqueParts([civicNumber ? street : input.address, input.city, postalCode ? `QC ${postalCode}` : "QC", "Canada"]),
  ])].filter((attempt) => attempt.length >= 5);
}

export function buildAddressFingerprint(data: PropertyData | PropertyGeocodingRequest): string | null {
  const address = data.address?.trim();
  if (!address) return null;
  return [address, data.city ?? "", normalizePostalCode(data.postalCode)].map(normalizeGeocodingText).join("|");
}

export function isValidCoordinates(value: unknown): value is PropertyCoordinates {
  if (!value || typeof value !== "object") return false;
  const coordinates = value as Partial<PropertyCoordinates>;
  return typeof coordinates.latitude === "number" && Number.isFinite(coordinates.latitude)
    && coordinates.latitude >= -90 && coordinates.latitude <= 90
    && typeof coordinates.longitude === "number" && Number.isFinite(coordinates.longitude)
    && coordinates.longitude >= -180 && coordinates.longitude <= 180;
}

export function isReusableGoogleGeo(data: PropertyData): data is PropertyData & { geo: PropertyGeoData } {
  const fingerprint = buildAddressFingerprint(data);
  const geo = data.geo;
  return Boolean(
    fingerprint
    && geo?.provider === "google"
    && isValidCoordinates(geo)
    && typeof geo.placeId === "string" && geo.placeId.length > 0
    && typeof geo.formattedAddress === "string" && geo.formattedAddress.length > 0
    && typeof geo.geocodedAddress === "string" && geo.geocodedAddress.length > 0
    && typeof geo.geocodedAt === "string" && !Number.isNaN(Date.parse(geo.geocodedAt))
    && geo.addressFingerprint === fingerprint,
  );
}

function readComponents(result: GoogleGeocodingResult): Map<string, { longName: string; shortName: string }> {
  if (!Array.isArray(result.address_components)) return new Map();
  const components = new Map<string, { longName: string; shortName: string }>();
  for (const rawComponent of result.address_components) {
    if (!rawComponent || typeof rawComponent !== "object") continue;
    const component = rawComponent as GoogleAddressComponent;
    if (!Array.isArray(component.types)) continue;
    const longName = typeof component.long_name === "string" ? component.long_name : "";
    const shortName = typeof component.short_name === "string" ? component.short_name : longName;
    for (const type of component.types.filter((value): value is string => typeof value === "string")) {
      components.set(type, { longName, shortName });
    }
  }
  return components;
}

function componentMatches(expected: string | undefined, component: { longName: string; shortName: string } | undefined): boolean {
  if (!expected?.trim()) return true;
  if (!component) return false;
  const normalizedExpected = normalizeGeocodingText(expected);
  return [component.longName, component.shortName].some((value) => normalizeGeocodingText(value) === normalizedExpected);
}

function streetMatches(expected: string, actual: { longName: string; shortName: string } | undefined): boolean {
  if (!actual) return false;
  const normalizedExpected = normalizeGeocodingText(expected);
  return [actual.longName, actual.shortName].some((value) => {
    const normalizedActual = normalizeGeocodingText(value);
    return normalizedExpected === normalizedActual
      || normalizedExpected.includes(normalizedActual)
      || normalizedActual.includes(normalizedExpected);
  });
}

function readGeometry(result: GoogleGeocodingResult): { coordinates: PropertyCoordinates; locationType: string } | null {
  if (!result.geometry || typeof result.geometry !== "object") return null;
  const geometry = result.geometry as { location?: unknown; location_type?: unknown };
  if (!geometry.location || typeof geometry.location !== "object") return null;
  const location = geometry.location as { lat?: unknown; lng?: unknown };
  const coordinates = { latitude: Number(location.lat), longitude: Number(location.lng) };
  if (!isValidCoordinates(coordinates)) return null;
  return { coordinates, locationType: typeof geometry.location_type === "string" ? geometry.location_type : "" };
}

function evaluateGoogleResult(result: GoogleGeocodingResult, input: PropertyGeocodingRequest) {
  if (result.partial_match === true) return null;
  const geometry = readGeometry(result);
  if (!geometry || !PRECISE_LOCATION_TYPES.has(geometry.locationType)) return null;
  if (geometry.coordinates.latitude < 44.5 || geometry.coordinates.latitude > 63
    || geometry.coordinates.longitude < -80 || geometry.coordinates.longitude > -57) return null;

  const resultTypes = Array.isArray(result.types)
    ? result.types.filter((value): value is string => typeof value === "string")
    : [];
  if (!resultTypes.some((type) => PRECISE_RESULT_TYPES.has(type))) return null;
  if (resultTypes.some((type) => WATER_OR_VAGUE_TYPES.has(type))) return null;

  const components = readComponents(result);
  const parsed = parseCivicAddress(input.address);
  if (!parsed.civicNumber || !componentMatches(parsed.civicNumber, components.get("street_number"))) return null;
  if (!streetMatches(parsed.street, components.get("route"))) return null;
  const locality = components.get("locality") ?? components.get("postal_town") ?? components.get("administrative_area_level_3");
  if (!componentMatches(input.city, locality)) return null;
  if (!componentMatches("QC", components.get("administrative_area_level_1"))) return null;
  if (!componentMatches("CA", components.get("country"))) return null;
  const expectedPostal = normalizePostalCode(input.postalCode).replace(/\s/g, "");
  const actualPostalComponent = components.get("postal_code");
  const actualPostal = normalizePostalCode(actualPostalComponent?.shortName || actualPostalComponent?.longName).replace(/\s/g, "");
  if (expectedPostal && expectedPostal !== actualPostal) return null;

  const formattedAddress = typeof result.formatted_address === "string" ? result.formatted_address.trim() : "";
  const placeId = typeof result.place_id === "string" ? result.place_id.trim() : "";
  if (!formattedAddress || !placeId) return null;
  return {
    coordinates: geometry.coordinates,
    formattedAddress,
    placeId,
    score: geometry.locationType === "ROOFTOP" ? 200 : 150,
  };
}

export function selectValidatedGoogleResult(value: unknown, input: PropertyGeocodingRequest) {
  const response = value && typeof value === "object" ? value as GoogleGeocodingResponse : null;
  if (!response || response.status !== "OK" || !Array.isArray(response.results)) return null;
  return response.results
    .map((result) => result && typeof result === "object" ? evaluateGoogleResult(result as GoogleGeocodingResult, input) : null)
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .sort((left, right) => right.score - left.score)[0] ?? null;
}

export function createValidatedGoogleLocation(
  input: PropertyGeocodingRequest,
  result: { coordinates: PropertyCoordinates; formattedAddress: string; placeId: string },
  geocodedAddress: string,
  geocodedAt = new Date().toISOString(),
): ValidatedPropertyLocation {
  return {
    geo: {
      ...result.coordinates,
      placeId: result.placeId,
      formattedAddress: result.formattedAddress,
      provider: "google",
      geocodedAddress,
      geocodedAt,
      addressFingerprint: buildAddressFingerprint(input)!,
    },
  };
}
