export type CentrisConfidence = "high" | "medium" | "low";
export type CentrisMarketStatus = "active" | "sold" | "rented" | "unknown";
export type CentrisPropertyType = "residential" | "condo" | "income_property" | "land" | "commercial" | "other";
export type CentrisPricingPurpose = "sale" | "rental" | "unknown";
export type CentrisPricingMode = "sale_price" | "monthly_rent" | "annual_per_square_foot" | "unknown";

export type ExtractedPDFPage = {
  pageNumber: number;
  text: string;
};

export type ExtractedPDFText = {
  pageCount: number;
  pages: ExtractedPDFPage[];
};

export type CentrisParseResult = {
  sourceFileName: string;
  pageCount: number;
  parserVersion: string;
  isRecognizedCentrisDocument: boolean;
  centrisNumber: string;
  centrisMarketStatus: CentrisMarketStatus;
  centrisMarketStatusRaw: string;
  address: {
    fullAddress: string;
    civicNumber: string;
    street: string;
    unit: string;
    city: string;
    province: string;
    postalCode: string;
    region: string;
    neighborhood: string;
    nearby: string;
  };
  property: {
    genreRaw: string;
    normalizedType: CentrisPropertyType;
    yearBuilt: number | null;
    numberOfUnits: number | null;
    numberOfRooms: number | null;
    bedroomsAboveGround: number | null;
    bedroomsBasement: number | null;
    bathrooms: number | null;
    powderRooms: number | null;
    intergenerational: boolean | null;
    livingAreaSqFt: number | null;
    buildingAreaSqFt: number | null;
    landAreaSqFt: number | null;
  };
  pricing: {
    rawText: string;
    detectedPurpose: CentrisPricingPurpose;
    mode: CentrisPricingMode;
    amount: number | null;
    monthlyAmount: number | null;
    annualPerSquareFootAmount: number | null;
    leaseTermMonths: number | null;
    taxesApplicable: boolean | null;
  };
  dates: {
    paAcceptedDate: string | null;
    conditionsLiftedDate: string | null;
    occupancyDate: string | null;
  };
  financial: {
    municipalTaxesAnnual: number | null;
    schoolTaxesAnnual: number | null;
    condoFeesMonthly: number | null;
    grossPotentialRevenueAnnual: number | null;
    netOperatingIncomeAnnual: number | null;
    supplementalRevenueMonthly: number | null;
  };
  rentalUnits: Array<{
    unitNumber: string;
    monthlyRent: number | null;
    leaseEndDate: string | null;
    rooms: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
  }>;
  sections: {
    inclusions: string;
    exclusions: string;
    remarks: string;
    addendum: string;
  };
  suggestedTransactionValues: {
    address: string;
    centrisNumber: string;
    price: number | null;
    promiseDate: string | null;
    generalNotes: string;
  };
  confidence: Record<string, CentrisConfidence>;
  sourcePages: Record<string, number[]>;
  warnings: string[];
};

export class CentrisPDFError extends Error {
  constructor(
    public readonly category: "invalid_pdf" | "no_text" | "unsupported_pdf" | "parse_failed",
    message: string,
    public readonly pageCount = 0,
    public readonly stage = "unknown",
  ) {
    super(message);
    this.name = "CentrisPDFError";
  }
}
