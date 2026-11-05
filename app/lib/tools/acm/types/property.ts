export type PropertyCategory =
  | "single_family"
  | "condo"
  | "farm"
  | "commercial_industrial"
  | "income_property"
  | "land"
  | "multi_category";

export type PropertyListingStatus = "active" | "sold" | "expired" | "withdrawn" | "unknown";

export type FieldConfidence = "high" | "medium" | "low";

export type PropertySourceType = "pdf" | "manual";

export type PropertyDocumentType = "centris" | "jlr" | "unknown";

export interface OriginalPropertySourcePage {
  mediaType: "application/pdf";
  pageNumber: 1;
  pdfBase64: string;
}

export interface PropertyTransaction {
  date?: string;
  amount?: number;
  deedNumber?: string;
}

export interface PropertyDimensions {
  width?: number;
  depth?: number;
  unit?: "ft" | "m";
  irregular?: boolean;
}

export interface PropertyArea {
  value?: number;
  unit?: "sqft" | "sqm";
}

export interface PropertyCoordinates {
  latitude: number;
  longitude: number;
}

export interface PropertyGeoData extends PropertyCoordinates {
  placeId: string;
  formattedAddress: string;
  provider: "google";
  geocodedAddress: string;
  geocodedAt: string;
  addressFingerprint: string;
}

/** @deprecated Anciennes coordonnées Nominatim conservées uniquement pour migrer les ACM existantes. */
export type PropertyGeocodingPrecision = "address" | "street";

/** @deprecated Utiliser PropertyData.geo. */
export interface PropertyGeocodingData {
  provider: "nominatim";
  addressFingerprint: string;
  precision: PropertyGeocodingPrecision;
}

export interface MunicipalAssessmentData {
  land?: number;
  building?: number;
  total?: number;
  year?: number;
}

export interface PhotoDetectionData {
  detected: boolean;
  count?: number;
  extractionSupported: boolean;
}

export interface RentData {
  unit?: string;
  monthlyRent?: number;
  leaseEndDate?: string;
  notes?: string;
}

export interface IncomePropertyData {
  numberOfUnits?: number;
  residentialRevenue?: number;
  commercialRevenue?: number;
  grossPotentialRevenue?: number;
  operatingExpenses?: number;
  netOperatingIncome?: number;
  rents?: RentData[];
  grossRevenueMultiplier?: number;
  pricePerDoor?: number;
  otherStatistics?: Record<string, string | number>;
}

export interface PropertyData {
  sourceFile?: string;
  centrisNumber?: string;
  status?: PropertyListingStatus;
  address?: string;
  city?: string;
  postalCode?: string;
  geo?: PropertyGeoData;
  /** @deprecated Anciennes coordonnées; elles sont ignorées par les cartes Google. */
  coordinates?: PropertyCoordinates;
  /** @deprecated Anciennes métadonnées; elles déclenchent un nouveau géocodage Google. */
  geocoding?: PropertyGeocodingData;
  region?: string;
  mrc?: string;
  neighborhood?: string;
  near?: string;
  propertyCategory?: PropertyCategory;
  propertyType?: string;
  buildingType?: string;
  numberOfFloors?: number;
  askingPrice?: number;
  soldPrice?: number;
  dateSold?: string;
  daysOnMarket?: number;
  yearBuilt?: number;
  buildingDimensions?: PropertyDimensions;
  buildingArea?: PropertyArea;
  livingArea?: PropertyArea;
  landDimensions?: PropertyDimensions;
  landArea?: PropertyArea;
  municipalAssessment?: MunicipalAssessmentData;
  municipalTaxes?: number;
  schoolTaxes?: number;
  rooms?: number;
  bedroomsAboveGround?: number;
  bedroomsBasement?: number;
  bedroomsTotal?: number;
  /** @deprecated Données historiques migrées vers bedroomsTotal au chargement. */
  bedrooms?: number;
  bathrooms?: number;
  powderRooms?: number;
  parking?: number;
  garage?: string;
  pool?: string;
  basement?: string;
  foundation?: string;
  roof?: string;
  heatingEnergy?: string;
  heating?: string[];
  heatPump?: string;
  waterSupply?: string;
  sewageSystem?: string;
  zoning?: string[];
  agriculturalZoning?: boolean;
  waterfront?: boolean;
  cadastre?: string;
  description?: string;
  remarks?: string;
  addendum?: string;
  features?: string[];
  photos?: string[];
  photoDetection?: PhotoDetectionData;
  incomeProperty?: IncomePropertyData;
  propertyTransactions?: PropertyTransaction[];
}


export interface ParsedProperty {
  id: string;
  sourceFile: string;
  sourceType?: PropertySourceType;
  documentType?: PropertyDocumentType;
  originalSourcePage?: OriginalPropertySourcePage;
  data: PropertyData;
  fieldConfidence: Record<string, FieldConfidence>;
  overallConfidence: FieldConfidence;
  pageCount: number;
  warnings: string[];
  debug?: {
    rawPdfText: string;
    parsedProperty: Record<string, string | undefined>;
    normalizedProperty: PropertyData;
  };
}

export interface PropertyParseError {
  sourceFile: string;
  code: string;
  message: string;
}

export interface ParsePropertiesResponse {
  results: ParsedProperty[];
  errors: PropertyParseError[];
}
