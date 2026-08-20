import type { ContactDraft } from "../data/contact-types";
import { inferBirthDateOrder, normalizeBirthDate } from "./birth-date";

export type CSVColumnSource = "header" | "content" | "profile" | "manual";
export type CSVImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "birthDate"
  | "phone"
  | "civicNumber"
  | "address"
  | "apartment"
  | "city"
  | "province"
  | "postalCode"
  | "country";
export type CSVConfirmationField = Extract<CSVImportField, "firstName" | "lastName" | "fullName" | "email" | "phone">;

export type CSVColumnMatch = {
  index: number;
  label: string;
  confidence: number;
  source: CSVColumnSource;
};

export type CSVImportColumn = {
  index: number;
  label: string;
  example: string;
};

export type CSVImportMapping = {
  delimiter: "," | ";";
  hasHeader: boolean;
  profileId: string | null;
  signature: string;
  requiresConfirmation: boolean;
  confirmationFields: CSVConfirmationField[];
  columns: CSVImportColumn[];
  firstName: CSVColumnMatch | null;
  lastName: CSVColumnMatch | null;
  fullName: CSVColumnMatch | null;
  email: CSVColumnMatch | null;
  birthDate: CSVColumnMatch | null;
  phone: CSVColumnMatch | null;
  phoneFallbacks: CSVColumnMatch[];
  civicNumber: CSVColumnMatch | null;
  address: CSVColumnMatch | null;
  apartment: CSVColumnMatch | null;
  city: CSVColumnMatch | null;
  province: CSVColumnMatch | null;
  postalCode: CSVColumnMatch | null;
  country: CSVColumnMatch | null;
};

export type CSVImportAnalysis = {
  drafts: ContactDraft[];
  mapping: CSVImportMapping;
};

type HeaderRole = CSVImportField | "date" | "other";

type ColumnProfile = {
  index: number;
  nonEmptyCount: number;
  coverage: number;
  emailRatio: number;
  phoneRatio: number;
  formattedPhoneRatio: number;
  dateRatio: number;
  birthDateRatio: number;
  plausibleBirthRatio: number;
  recentDateRatio: number;
  medianDateYear: number | null;
  postalRatio: number;
  civicNumberRatio: number;
  sequentialNumberRatio: number;
  addressRatio: number;
  provinceRatio: number;
  apartmentRatio: number;
  apartmentCandidateRatio: number;
  countryRatio: number;
  knownCityRatio: number;
  cityScore: number;
  nameRatio: number;
  nameScore: number;
  uniqueness: number;
  averageWords: number;
};

type RecognizedNameProfile = {
  id: string;
  firstName: ColumnProfile;
  lastName: ColumnProfile;
  confidence: number;
};

const MAX_INFERENCE_ROWS = 200;
const CSV_IMPORT_FIELDS = new Set<HeaderRole>([
  "firstName", "lastName", "fullName", "email", "phone",
  "birthDate",
  "civicNumber", "address", "apartment", "city", "province", "postalCode", "country",
]);

const HEADER_ALIASES: Record<CSVImportField, ReadonlyArray<string>> = {
  firstName: ["prenom", "prenoms", "firstname", "givenname", "forename", "first"],
  lastName: ["nom", "nomdefamille", "lastname", "surname", "familyname", "last"],
  fullName: ["nomcomplet", "fullname", "displayname", "contactname", "clientname", "name"],
  email: ["email", "courriel", "mail", "emailaddress", "adresseemail", "adressecourriel"],
  birthDate: ["datedenaissance", "naissance", "anniversaire", "dateanniversaire", "birthday", "birthdate", "dateofbirth", "dob"],
  phone: [
    "telephone",
    "telephoneprincipal",
    "telephoneprimaire",
    "tel",
    "phone",
    "phonenumber",
    "telephonenumber",
    "numerotelephone",
    "numerodetelephone",
    "primaryphone",
    "mainphone",
    "cellulaire",
    "cellphone",
    "mobile",
    "mobilephone",
    "mobilenumber",
    "homephone",
    "workphone",
    "businessphone",
  ],
  civicNumber: ["numerocivique", "civicnumber", "streetnumber", "housenumber", "numero", "nocivique"],
  address: ["adresse", "address", "adressecomplete", "fulladdress", "streetaddress", "rue", "street", "addressline1"],
  apartment: ["appartement", "apartment", "app", "apt", "unite", "unit", "suite", "addressline2"],
  city: ["ville", "city", "municipalite", "municipality", "localite", "locality"],
  province: ["province", "state", "region"],
  postalCode: ["codepostal", "postalcode", "zipcode", "zip"],
  country: ["pays", "country", "nation"],
};

const IGNORED_HEADER_ALIASES: Record<Exclude<HeaderRole, CSVImportField>, ReadonlyArray<string>> = {
  date: ["date", "createdat", "updatedat", "datecreation", "datemodification"],
  other: ["note", "notes", "tag", "tags", "categorie", "category", "langue", "language", "sexe", "gender", "id", "identifiant"],
};

function normalizeImportedValue(value: string) {
  return value.trim().normalize("NFC");
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function headerRole(value: string): HeaderRole | null {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;

  for (const [role, aliases] of Object.entries(HEADER_ALIASES) as Array<[CSVImportField, ReadonlyArray<string>]>) {
    if (aliases.includes(normalized)) return role;
  }

  if (/^(telephone|phone|mobile|cellulaire|cellphone|tel)(number|numero|principal|primaire|primary|main|home|work|business|mobile|cellulaire|[0-9]+)?$/.test(normalized)) {
    return "phone";
  }
  if (/^(email|courriel|mail)(address|adresse|principal|primary|[0-9]+)?$/.test(normalized)) {
    return "email";
  }

  for (const [role, aliases] of Object.entries(IGNORED_HEADER_ALIASES) as Array<[Exclude<HeaderRole, CSVImportField>, ReadonlyArray<string>]>) {
    if (aliases.includes(normalized)) return role;
  }

  return null;
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === delimiter) {
      row.push(normalizeImportedValue(cell));
      cell = "";
    } else if (!inQuotes && (character === "\n" || character === "\r")) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(normalizeImportedValue(cell));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(normalizeImportedValue(cell));
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function delimiterQuality(text: string, delimiter: "," | ";") {
  const rows = parseDelimitedRows(text, delimiter).slice(0, 25);
  if (rows.length === 0) return 0;

  const widths = rows.map((row) => row.length);
  const frequencies = new Map<number, number>();
  for (const width of widths) frequencies.set(width, (frequencies.get(width) ?? 0) + 1);
  const [modeWidth, modeCount] = [...frequencies.entries()].sort((first, second) => second[1] - first[1])[0] ?? [1, 0];
  if (modeWidth <= 1) return 0;
  return modeWidth + modeCount / rows.length;
}

function detectDelimiter(text: string): "," | ";" {
  return delimiterQuality(text, ";") > delimiterQuality(text, ",") ? ";" : ",";
}

function hasHeaderRow(row: ReadonlyArray<string>) {
  const nonEmpty = row.filter(Boolean);
  if (nonEmpty.length === 0) return false;

  const roles = nonEmpty.map(headerRole).filter((role): role is HeaderRole => role !== null);
  const contactRoles = roles.filter((role): role is CSVImportField => CSV_IMPORT_FIELDS.has(role));
  return contactRoles.length >= 2
    || (contactRoles.length >= 1 && roles.length / nonEmpty.length >= 0.5)
    || (nonEmpty.length === 1 && contactRoles.length === 1);
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value.trim());
}

function looksLikeCanadianPostalCode(value: string) {
  return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(value.trim());
}

function looksLikeDate(value: string) {
  const trimmed = value.trim();
  return /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T].*)?$/.test(trimmed)
    || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?:[ T].*)?$/.test(trimmed)
    || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed);
}

function looksLikeCivicNumber(value: string) {
  const trimmed = value.trim();
  if (
    !trimmed
    || looksLikeDate(trimmed)
    || looksLikeCanadianPostalCode(trimmed)
    || looksLikeEmail(trimmed)
    || /[$€£]|\d[.,]\d{2}$/.test(trimmed)
  ) return false;
  return /^\d{1,6}(?:[a-z]|-[a-z0-9]{1,6})?$/i.test(trimmed);
}

function sequentialNumberRatio(values: ReadonlyArray<string>) {
  const numericValues = values
    .filter((value) => /^\d{1,6}$/.test(value.trim()))
    .map(Number);
  if (numericValues.length < 4) return 0;
  let sequentialPairs = 0;
  for (let index = 1; index < numericValues.length; index += 1) {
    if (Math.abs(numericValues[index] - numericValues[index - 1]) === 1) sequentialPairs += 1;
  }
  return sequentialPairs / (numericValues.length - 1);
}

function looksLikeProvince(value: string) {
  return /^(qc|qu[eé]bec|on|ontario|nb|nouveau-brunswick|ns|nouvelle-[eé]cosse|pe|ipe|mb|manitoba|sk|saskatchewan|ab|alberta|bc|colombie-britannique)$/i.test(value.trim());
}

function looksLikeAddressWithCivicNumber(value: string) {
  const trimmed = value.trim();
  if (/^\d{1,3}(?:e|er|re)\s+(?:avenue|rue|rang)\b/iu.test(trimmed)) return false;
  return /^\d{1,6}(?:[a-z]|-[a-z0-9]{1,6})?,?\s+\p{L}/iu.test(trimmed);
}

function looksLikeAddress(value: string) {
  const trimmed = value.trim();
  return /^\d{1,6},?\s+\S+/u.test(trimmed)
    || /^\d{1,3}(?:e|er|re)\s+(?:avenue|rue|rang)\b/iu.test(trimmed)
    || /^(rue|avenue|av\.?|boulevard|boul\.?|chemin|ch\.?|route|rang|place|mont[eé]e)\b/iu.test(trimmed);
}

function looksLikeApartment(value: string) {
  return /^(?:app\.?|apt\.?|appartement|unit[eé]|unit|suite)\s*[a-z0-9-]+$/i.test(value.trim())
    || /^#\s*[a-z0-9-]+$/i.test(value.trim());
}

function looksLikeApartmentCandidate(value: string) {
  const trimmed = value.trim();
  if (looksLikeApartment(trimmed)) return true;
  if (looksLikePhone(trimmed) || looksLikeDate(trimmed) || looksLikeCanadianPostalCode(trimmed)) return false;
  return /^(?:\d{1,4}|[a-z]|ph\d{1,3}|[a-z]\d{1,4})$/i.test(trimmed);
}

function looksLikeCountry(value: string) {
  return /^(canada|ca|united states|usa|[eé]tats-unis|france|mexique|mexico)$/i.test(value.trim());
}

const KNOWN_CITIES = new Set([
  "deux montagnes",
  "montreal",
  "laval",
  "mirabel",
  "saint eustache",
  "sainte therese",
  "boisbriand",
  "blainville",
  "rosemere",
  "terrebonne",
  "mascouche",
  "longueuil",
  "brossard",
  "repentigny",
  "gatineau",
  "quebec",
  "sherbrooke",
  "trois rivieres",
]);

function normalizedLocation(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr-CA");
}

function looksLikeKnownCity(value: string) {
  return KNOWN_CITIES.has(normalizedLocation(value));
}

function phoneDigits(value: string) {
  return value.replace(/(?:ext\.?|poste|x)\s*\d+$/i, "").replace(/\D/g, "");
}

function looksLikePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed || looksLikeDate(trimmed) || looksLikeCanadianPostalCode(trimmed) || looksLikeEmail(trimmed)) return false;
  if (!/^[+\d().\s-]+(?:(?:ext\.?|poste|x)\s*\d+)?$/i.test(trimmed)) return false;
  const digits = phoneDigits(trimmed);
  if (/^(\d)\1+$/.test(digits)) return false;
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function hasPhoneFormatting(value: string) {
  return /[+() -]/.test(value.trim());
}

function looksLikeName(value: string) {
  const trimmed = value.trim();
  if (
    !trimmed
    || looksLikeEmail(trimmed)
    || looksLikePhone(trimmed)
    || looksLikeDate(trimmed)
    || looksLikeCanadianPostalCode(trimmed)
    || looksLikeCivicNumber(trimmed)
    || looksLikeProvince(trimmed)
    || looksLikeAddress(trimmed)
    || looksLikeApartment(trimmed)
    || looksLikeCountry(trimmed)
    || looksLikeKnownCity(trimmed)
  ) return false;
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’ .-]*$/u.test(trimmed)) return false;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  return !/^(oui|non|yes|no|m|f|fr|en|fran[cç]ais|anglais|actif|inactive?|client|prospect)$/i.test(trimmed);
}

function ratio(values: ReadonlyArray<string>, predicate: (value: string) => boolean) {
  return values.length === 0 ? 0 : values.filter(predicate).length / values.length;
}

function profileColumns(rows: ReadonlyArray<ReadonlyArray<string>>) {
  const sampleRows = rows.slice(0, MAX_INFERENCE_ROWS);
  const columnCount = sampleRows.reduce((maximum, row) => Math.max(maximum, row.length), 0);

  return Array.from({ length: columnCount }, (_, index): ColumnProfile => {
    const values = sampleRows.map((row) => normalizeImportedValue(row[index] ?? "")).filter(Boolean);
    const nameValues = values.filter(looksLikeName);
    const uniqueness = values.length === 0 ? 0 : new Set(values.map((value) => value.toLocaleLowerCase("fr-CA"))).size / values.length;
    const averageWords = nameValues.length === 0
      ? 0
      : nameValues.reduce((total, value) => total + value.split(/\s+/).length, 0) / nameValues.length;
    const nameRatio = ratio(values, looksLikeName);
    const emailRatio = ratio(values, looksLikeEmail);
    const phoneRatio = ratio(values, looksLikePhone);
    const dateRatio = ratio(values, looksLikeDate);
    const birthOrder = inferBirthDateOrder(values);
    const normalizedDates = values.map((value) => normalizeBirthDate(value, { order: birthOrder })).filter(Boolean);
    const currentYear = new Date().getFullYear();
    const dateYears = normalizedDates.map((value) => Number(value.slice(0, 4))).sort((first, second) => first - second);
    const plausibleBirthRatio = ratio(normalizedDates, (value) => {
      const age = currentYear - Number(value.slice(0, 4));
      return age >= 18 && age <= 100;
    });
    const recentDateRatio = ratio(normalizedDates, (value) => Number(value.slice(0, 4)) >= currentYear - 10);
    const postalRatio = ratio(values, looksLikeCanadianPostalCode);
    const civicNumberRatio = ratio(values, looksLikeCivicNumber);
    const addressRatio = ratio(values, looksLikeAddress);
    const provinceRatio = ratio(values, looksLikeProvince);
    const apartmentRatio = ratio(values, looksLikeApartment);
    const apartmentCandidateRatio = ratio(values, looksLikeApartmentCandidate);
    const countryRatio = ratio(values, looksLikeCountry);
    const knownCityRatio = ratio(values, looksLikeKnownCity);
    const wordShapeScore = averageWords > 0 && averageWords <= 2.5 ? 1 : averageWords <= 4 ? 0.55 : 0;
    const exclusionPenalty = Math.max(emailRatio, phoneRatio, dateRatio, postalRatio, civicNumberRatio, addressRatio, provinceRatio, apartmentRatio, countryRatio, knownCityRatio);
    const nameScore = Math.max(0, nameRatio * 0.58 + uniqueness * 0.27 + wordShapeScore * 0.15 - exclusionPenalty * 0.8);
    const cityScore = Math.min(1, knownCityRatio * 0.82 + nameRatio * 0.12 + (1 - uniqueness) * 0.06);

    return {
      index,
      nonEmptyCount: values.length,
      coverage: sampleRows.length === 0 ? 0 : values.length / sampleRows.length,
      emailRatio,
      phoneRatio,
      formattedPhoneRatio: ratio(values.filter(looksLikePhone), hasPhoneFormatting),
      dateRatio,
      birthDateRatio: values.length === 0 ? 0 : normalizedDates.length / values.length,
      plausibleBirthRatio,
      recentDateRatio,
      medianDateYear: dateYears.length > 0 ? dateYears[Math.floor(dateYears.length / 2)] : null,
      postalRatio,
      civicNumberRatio,
      sequentialNumberRatio: sequentialNumberRatio(values),
      addressRatio,
      provinceRatio,
      apartmentRatio,
      apartmentCandidateRatio,
      countryRatio,
      knownCityRatio,
      cityScore,
      nameRatio,
      nameScore,
      uniqueness,
      averageWords,
    };
  });
}

function columnLabel(index: number, headerRow: ReadonlyArray<string> | null) {
  return headerRow?.[index] ? normalizeImportedValue(headerRow[index]) : `Colonne ${index + 1}`;
}

function matchColumn(
  profile: ColumnProfile,
  headerRow: ReadonlyArray<string> | null,
  confidence: number,
  source: CSVColumnSource,
): CSVColumnMatch {
  return {
    index: profile.index,
    label: columnLabel(profile.index, headerRow),
    confidence: Math.max(0, Math.min(1, confidence)),
    source,
  };
}

function headerIndexes(headerRow: ReadonlyArray<string>, role: CSVImportField) {
  return headerRow.flatMap((value, index) => headerRole(value) === role ? [index] : []);
}

function phoneHeaderPriority(value: string) {
  const normalized = normalizeHeader(value);
  if (/principal|primaire|primary|main/.test(normalized)) return 4;
  if (/mobile|cellulaire|cellphone/.test(normalized)) return 3;
  if (/telephone|phone|tel/.test(normalized)) return 2;
  return 1;
}

function dominantColumnType(profile: ColumnProfile) {
  const types: Array<[string, number]> = [
    ["email", profile.emailRatio],
    ["phone", profile.phoneRatio],
    ["birthDate", profile.birthDateRatio * profile.plausibleBirthRatio],
    ["date", profile.dateRatio],
    ["postal", profile.postalRatio],
    ["civicNumber", profile.civicNumberRatio * (1 - profile.sequentialNumberRatio)],
    ["address", profile.addressRatio],
    ["province", profile.provinceRatio],
    ["apartment", profile.apartmentRatio],
    ["country", profile.countryRatio],
    ["city", profile.cityScore],
    ["name", profile.nameScore],
  ];
  const [type, score] = types.sort((first, second) => second[1] - first[1])[0] ?? ["other", 0];
  return score >= 0.5 ? type : "other";
}

function recognizeKnownNameProfile(
  email: CSVColumnMatch | null,
  profiles: ReadonlyMap<number, ColumnProfile>,
  nameCandidates: ReadonlyArray<ColumnProfile>,
): RecognizedNameProfile | null {
  if (!email) return null;

  const patterns = [
    { id: "email-last-first", firstNameOffset: 2, lastNameOffset: 1, confidence: 0.92 },
    { id: "first-last-email", firstNameOffset: -2, lastNameOffset: -1, confidence: 0.88 },
  ] as const;

  for (const pattern of patterns) {
    const firstName = profiles.get(email.index + pattern.firstNameOffset);
    const lastName = profiles.get(email.index + pattern.lastNameOffset);
    if (firstName && lastName && nameCandidates.includes(firstName) && nameCandidates.includes(lastName)) {
      return { id: pattern.id, firstName, lastName, confidence: pattern.confidence };
    }
  }

  return null;
}

function civicAddressPairScore(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  civicProfile: ColumnProfile,
  addressProfile: ColumnProfile,
) {
  const sampleRows = rows.slice(0, MAX_INFERENCE_ROWS);
  let pairedRows = 0;
  let plausiblePairs = 0;

  for (const row of sampleRows) {
    const civicNumber = normalizeImportedValue(row[civicProfile.index] ?? "");
    const street = normalizeImportedValue(row[addressProfile.index] ?? "");
    if (!civicNumber || !street) continue;
    pairedRows += 1;
    if (looksLikeCivicNumber(civicNumber) && looksLikeAddress(street) && looksLikeAddress(`${civicNumber} ${street}`)) {
      plausiblePairs += 1;
    }
  }

  const pairRatio = pairedRows === 0 ? 0 : plausiblePairs / pairedRows;
  const coverageSimilarity = 1 - Math.abs(civicProfile.coverage - addressProfile.coverage);
  const sharedCoverage = sampleRows.length === 0 ? 0 : pairedRows / sampleRows.length;
  return Math.max(0, Math.min(1,
    civicProfile.civicNumberRatio * 0.38
    + pairRatio * 0.34
    + coverageSimilarity * 0.12
    + sharedCoverage * 0.12
    + addressProfile.addressRatio * 0.04
    - civicProfile.sequentialNumberRatio * 0.55,
  ));
}

function apartmentAddressPairScore(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  apartmentProfile: ColumnProfile,
  addressProfile: ColumnProfile,
  civicProfile: ColumnProfile | null,
) {
  const sampleRows = rows.slice(0, MAX_INFERENCE_ROWS);
  let apartmentRows = 0;
  let associatedRows = 0;

  for (const row of sampleRows) {
    const apartment = normalizeImportedValue(row[apartmentProfile.index] ?? "");
    if (!apartment) continue;
    apartmentRows += 1;
    const address = normalizeImportedValue(row[addressProfile.index] ?? "");
    const civicNumber = civicProfile ? normalizeImportedValue(row[civicProfile.index] ?? "") : "";
    if (looksLikeApartmentCandidate(apartment) && looksLikeAddress(address) && (!civicProfile || looksLikeCivicNumber(civicNumber))) {
      associatedRows += 1;
    }
  }

  const associationRatio = apartmentRows === 0 ? 0 : associatedRows / apartmentRows;
  const sparseCoverageScore = apartmentProfile.coverage <= 0.45
    ? 1
    : Math.max(0, (0.8 - apartmentProfile.coverage) / 0.35);
  return Math.max(0, Math.min(1,
    apartmentProfile.apartmentCandidateRatio * 0.3
    + associationRatio * 0.3
    + sparseCoverageScore * 0.2
    + apartmentProfile.apartmentRatio * 0.15
    + (1 - apartmentProfile.sequentialNumberRatio) * 0.05
    - apartmentProfile.sequentialNumberRatio * 0.45,
  ));
}

function inferMapping(rows: string[][], hasHeader: boolean, delimiter: "," | ";"): CSVImportMapping {
  const headerRow = hasHeader ? rows[0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const profiles = profileColumns(dataRows);
  const columns = profiles.map((profile) => ({
    index: profile.index,
    label: columnLabel(profile.index, headerRow),
    example: dataRows.find((row) => Boolean(row[profile.index]))?.[profile.index] ?? "",
  }));

  const profileByIndex = new Map(profiles.map((profile) => [profile.index, profile]));
  const headerMatch = (role: CSVImportField) => {
    if (!headerRow) return null;
    const index = headerIndexes(headerRow, role)[0];
    const profile = profileByIndex.get(index);
    return index >= 0 && profile ? matchColumn(profile, headerRow, 0.99, "header") : null;
  };

  let email = headerMatch("email");
  if (!email) {
    const emailCandidates = profiles
      .filter((profile) => profile.nonEmptyCount > 0 && profile.emailRatio >= 0.5)
      .sort((first, second) => (second.emailRatio * 0.85 + second.coverage * 0.15) - (first.emailRatio * 0.85 + first.coverage * 0.15));
    const best = emailCandidates[0];
    if (best) email = matchColumn(best, headerRow, best.emailRatio * 0.9 + best.coverage * 0.1, "content");
  }

  const headerPhoneProfiles = headerRow
    ? headerIndexes(headerRow, "phone")
      .map((index) => profileByIndex.get(index))
      .filter((profile): profile is ColumnProfile => Boolean(profile))
      .filter((profile) => profile.nonEmptyCount === 0 || profile.phoneRatio >= 0.3)
      .sort((first, second) => {
        const priorityDifference = phoneHeaderPriority(headerRow[second.index] ?? "") - phoneHeaderPriority(headerRow[first.index] ?? "");
        return priorityDifference || second.phoneRatio - first.phoneRatio;
      })
    : [];
  const inferredPhoneProfiles = profiles
    .filter((profile) => profile.nonEmptyCount > 0 && profile.phoneRatio >= 0.5)
    .sort((first, second) => {
      const secondScore = second.phoneRatio * 0.72 + second.formattedPhoneRatio * 0.18 + second.coverage * 0.1;
      const firstScore = first.phoneRatio * 0.72 + first.formattedPhoneRatio * 0.18 + first.coverage * 0.1;
      return secondScore - firstScore;
    });
  const phoneProfiles = [...headerPhoneProfiles, ...inferredPhoneProfiles]
    .filter((profile, index, all) => all.findIndex((candidate) => candidate.index === profile.index) === index);
  const phoneMatches = phoneProfiles.map((profile) => matchColumn(
    profile,
    headerRow,
    headerPhoneProfiles.some((candidate) => candidate.index === profile.index)
      ? Math.max(0.86, profile.phoneRatio)
      : profile.phoneRatio * 0.82 + profile.formattedPhoneRatio * 0.18,
    headerPhoneProfiles.some((candidate) => candidate.index === profile.index) ? "header" : "content",
  ));

  const bestContentMatch = (
    score: (profile: ColumnProfile) => number,
    threshold: number,
    excluded: ReadonlySet<number> = new Set(),
    minimumGap = 0,
  ) => {
    const candidates = profiles
      .filter((profile) => profile.nonEmptyCount > 0 && !excluded.has(profile.index) && score(profile) >= threshold)
      .sort((first, second) => score(second) - score(first) || second.coverage - first.coverage);
    const [best, second] = candidates;
    if (best && second && score(best) - score(second) < minimumGap) return null;
    return best ? matchColumn(best, headerRow, score(best), "content") : null;
  };

  const currentYear = new Date().getFullYear();
  const newestDateMedian = Math.max(...profiles.flatMap((profile) => profile.medianDateYear === null ? [] : [profile.medianDateYear]), 0);
  const birthDateScore = (profile: ColumnProfile) => {
    const medianAge = profile.medianDateYear === null ? 0 : currentYear - profile.medianDateYear;
    const oldEnoughBonus = medianAge >= 25 && medianAge <= 90 ? 0.12 : 0;
    const olderThanOperationalDatesBonus = profile.medianDateYear !== null && newestDateMedian - profile.medianDateYear >= 15 ? 0.08 : 0;
    return Math.max(0, Math.min(1,
      profile.birthDateRatio * 0.28
      + profile.plausibleBirthRatio * 0.56
      + oldEnoughBonus
      + olderThanOperationalDatesBonus
      + Math.min(profile.coverage, 0.5) * 0.08
      - profile.recentDateRatio * 0.65,
    ));
  };
  const birthDate = headerMatch("birthDate") ?? bestContentMatch(birthDateScore, 0.72, new Set(), 0.12);

  const address = headerMatch("address") ?? bestContentMatch((profile) => profile.addressRatio, 0.5, new Set(), 0.08);
  const addressProfile = address ? profileByIndex.get(address.index) ?? null : null;
  const civicHeaderMatch = headerMatch("civicNumber");
  const civicHeaderIsAmbiguous = civicHeaderMatch
    ? normalizeHeader(headerRow?.[civicHeaderMatch.index] ?? "") === "numero"
    : false;
  const addressValues = addressProfile
    ? dataRows.map((row) => normalizeImportedValue(row[addressProfile.index] ?? "")).filter(Boolean)
    : [];
  const addressAlreadyIncludesCivicNumber = ratio(addressValues, looksLikeAddressWithCivicNumber) >= 0.5;
  const civicCandidates = addressProfile && !addressAlreadyIncludesCivicNumber
    ? profiles
      .filter((profile) => profile.index !== addressProfile.index && profile.nonEmptyCount > 0 && profile.civicNumberRatio >= 0.65)
      .map((profile) => ({ profile, score: civicAddressPairScore(dataRows, profile, addressProfile) }))
      .filter((candidate) => candidate.score >= 0.68)
      .sort((first, second) => second.score - first.score || second.profile.coverage - first.profile.coverage)
    : [];
  const inferredCivic = civicCandidates[0] && (!civicCandidates[1] || civicCandidates[0].score - civicCandidates[1].score >= 0.08)
    ? matchColumn(civicCandidates[0].profile, headerRow, civicCandidates[0].score, "content")
    : null;
  const civicNumber = civicHeaderMatch && !civicHeaderIsAmbiguous
    ? civicHeaderMatch
    : civicHeaderMatch && inferredCivic?.index === civicHeaderMatch.index
      ? { ...inferredCivic, source: "header" as const }
      : inferredCivic;
  const addressExcluded = new Set([address?.index, civicNumber?.index].filter((index): index is number => index !== undefined));
  const civicProfile = civicNumber ? profileByIndex.get(civicNumber.index) ?? null : null;
  const apartmentHeader = headerMatch("apartment");
  const apartmentCandidates = !apartmentHeader && addressProfile
    ? profiles
      .filter((profile) => !addressExcluded.has(profile.index) && profile.nonEmptyCount > 0)
      .filter((profile) => profile.emailRatio < 0.2 && profile.phoneRatio < 0.2 && profile.dateRatio < 0.2 && profile.postalRatio < 0.2)
      .map((profile) => ({ profile, score: apartmentAddressPairScore(dataRows, profile, addressProfile, civicProfile) }))
      .filter((candidate) => candidate.score >= 0.78)
      .sort((first, second) => second.score - first.score || second.profile.coverage - first.profile.coverage)
    : [];
  const apartment = apartmentHeader
    ?? (apartmentCandidates[0] && (!apartmentCandidates[1] || apartmentCandidates[0].score - apartmentCandidates[1].score >= 0.08)
      ? matchColumn(apartmentCandidates[0].profile, headerRow, apartmentCandidates[0].score, "content")
      : null);
  const postalCode = headerMatch("postalCode") ?? bestContentMatch((profile) => profile.postalRatio, 0.6, addressExcluded, 0.08);
  const province = headerMatch("province") ?? bestContentMatch((profile) => profile.provinceRatio, 0.6, addressExcluded, 0.08);
  const country = headerMatch("country") ?? bestContentMatch((profile) => profile.countryRatio, 0.6, addressExcluded, 0.08);
  const locationIndexes = new Set([
    address?.index,
    civicNumber?.index,
    apartment?.index,
    postalCode?.index,
    province?.index,
    country?.index,
  ].filter((index): index is number => index !== undefined));
  let city = headerMatch("city") ?? bestContentMatch((profile) => profile.cityScore, 0.5, locationIndexes, 0.08);
  if (!city) {
    const anchors = [...locationIndexes];
    const nearbyCity = profiles
      .filter((profile) => !locationIndexes.has(profile.index) && profile.nameRatio >= 0.6)
      .filter((profile) => anchors.some((index) => Math.abs(index - profile.index) <= 2))
      .sort((first, second) => second.nameRatio - first.nameRatio || first.index - second.index)[0];
    if (nearbyCity) city = matchColumn(nearbyCity, headerRow, 0.65, "profile");
  }

  let firstName = headerMatch("firstName");
  let lastName = headerMatch("lastName");
  let fullName = headerMatch("fullName");
  let usedProfile = false;
  let profileId: string | null = hasHeader ? "recognized-headers" : null;

  const excludedIndexes = new Set<number>([
    email?.index,
    birthDate?.index,
    ...phoneMatches.map((match) => match.index),
    address?.index,
    civicNumber?.index,
    apartment?.index,
    city?.index,
    province?.index,
    postalCode?.index,
    country?.index,
  ].filter((index): index is number => index !== undefined));
  const nameCandidates = profiles
    .filter((profile) => !excludedIndexes.has(profile.index) && profile.nonEmptyCount > 0 && profile.nameRatio >= 0.5 && profile.nameScore >= 0.48)
    .sort((first, second) => second.nameScore - first.nameScore || first.index - second.index);

  if (!firstName && !lastName && !fullName) {
    const recognizedProfile = recognizeKnownNameProfile(email, profileByIndex, nameCandidates);
    if (recognizedProfile) {
      firstName = matchColumn(recognizedProfile.firstName, headerRow, recognizedProfile.confidence, "profile");
      lastName = matchColumn(recognizedProfile.lastName, headerRow, recognizedProfile.confidence, "profile");
      profileId = recognizedProfile.id;
      usedProfile = true;
    }
  }

  if (!firstName && !lastName && !fullName) {
    const [best, second] = nameCandidates;
    if (best && (!second || (best.averageWords >= 1.45 && best.nameScore - second.nameScore >= 0.12))) {
      fullName = matchColumn(best, headerRow, best.nameScore, "content");
    } else if (best && second) {
      const ordered = [best, second].sort((first, next) => first.index - next.index);
      firstName = matchColumn(ordered[0], headerRow, ordered[0].nameScore, "content");
      lastName = matchColumn(ordered[1], headerRow, ordered[1].nameScore, "content");
    }
  } else {
    if (!firstName && !fullName) {
      const candidate = nameCandidates.find((profile) => profile.index !== lastName?.index);
      if (candidate) firstName = matchColumn(candidate, headerRow, candidate.nameScore, "content");
    }
    if (!lastName && !fullName) {
      const candidate = nameCandidates.find((profile) => profile.index !== firstName?.index);
      if (candidate) lastName = matchColumn(candidate, headerRow, candidate.nameScore, "content");
    }
  }

  const topEmailProfiles = profiles.filter((profile) => profile.emailRatio >= 0.5).sort((first, second) => second.emailRatio - first.emailRatio);
  const emailAmbiguous = !hasHeader
    && topEmailProfiles.length > 1
    && Math.abs(topEmailProfiles[0].emailRatio - topEmailProfiles[1].emailRatio) < 0.08;
  const separateNamesAmbiguous = !hasHeader
    && !usedProfile
    && firstName?.source === "content"
    && lastName?.source === "content"
    && Math.abs(firstName.confidence - lastName.confidence) < 0.08;
  const missingIdentityMapping = !email && phoneMatches.length === 0 && !fullName && !firstName && !lastName;
  const confirmationFields = new Set<CSVConfirmationField>();
  if (emailAmbiguous) confirmationFields.add("email");
  if (separateNamesAmbiguous) {
    confirmationFields.add("lastName");
  }
  if (missingIdentityMapping) {
    confirmationFields.add("fullName");
    confirmationFields.add("email");
    confirmationFields.add("phone");
  }

  return {
    delimiter,
    hasHeader,
    profileId,
    signature: `${profileId ?? (hasHeader ? "header" : "data")}:${profiles.map(dominantColumnType).join("|")}`,
    requiresConfirmation: confirmationFields.size > 0,
    confirmationFields: [...confirmationFields],
    columns,
    firstName,
    lastName,
    fullName,
    email,
    birthDate,
    phone: phoneMatches[0] ?? null,
    phoneFallbacks: phoneMatches.slice(1),
    civicNumber,
    address,
    apartment,
    city,
    province,
    postalCode,
    country,
  };
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function parseCSVContactsWithMapping(text: string, mapping: CSVImportMapping): ContactDraft[] {
  const rows = parseDelimitedRows(text.replace(/^\uFEFF/, ""), mapping.delimiter);
  const dataRows = mapping.hasHeader ? rows.slice(1) : rows;
  const phoneColumns = [mapping.phone, ...mapping.phoneFallbacks].filter((match): match is CSVColumnMatch => Boolean(match));
  const birthDateValues = mapping.birthDate
    ? dataRows.map((row) => normalizeImportedValue(row[mapping.birthDate?.index ?? -1] ?? "")).filter(Boolean)
    : [];
  const birthDateOrder = inferBirthDateOrder(birthDateValues);

  return dataRows.map((row) => {
    const fullName = mapping.fullName ? row[mapping.fullName.index] ?? "" : "";
    const splitName = splitFullName(fullName);
    const phone = phoneColumns
      .map((match) => row[match.index] ?? "")
      .find((value) => looksLikePhone(value)) ?? "";

    return {
      firstName: normalizeImportedValue((mapping.firstName ? row[mapping.firstName.index] : "") || splitName.firstName),
      lastName: normalizeImportedValue((mapping.lastName ? row[mapping.lastName.index] : "") || splitName.lastName),
      phone: normalizeImportedValue(phone),
      email: normalizeImportedValue(mapping.email ? row[mapping.email.index] ?? "" : ""),
      birthDate: normalizeBirthDate(mapping.birthDate ? row[mapping.birthDate.index] ?? "" : "", { order: birthDateOrder }),
      mortgageRenewalDate: "",
      civicNumber: normalizeImportedValue(mapping.civicNumber ? row[mapping.civicNumber.index] ?? "" : ""),
      address: normalizeImportedValue(mapping.address ? row[mapping.address.index] ?? "" : ""),
      apartment: normalizeImportedValue(mapping.apartment ? row[mapping.apartment.index] ?? "" : ""),
      city: normalizeImportedValue(mapping.city ? row[mapping.city.index] ?? "" : ""),
      province: normalizeImportedValue(mapping.province ? row[mapping.province.index] ?? "" : ""),
      postalCode: normalizeImportedValue(mapping.postalCode ? row[mapping.postalCode.index] ?? "" : ""),
      country: normalizeImportedValue(mapping.country ? row[mapping.country.index] ?? "" : ""),
    };
  });
}

export function analyzeCSVContacts(text: string): CSVImportAnalysis {
  const normalizedText = text.replace(/^\uFEFF/, "").normalize("NFC");
  const delimiter = detectDelimiter(normalizedText);
  const rows = parseDelimitedRows(normalizedText, delimiter);
  const hasHeader = rows.length > 0 && hasHeaderRow(rows[0]);
  const mapping = inferMapping(rows, hasHeader, delimiter);
  return { drafts: parseCSVContactsWithMapping(normalizedText, mapping), mapping };
}

export function parseCSVContacts(text: string) {
  return analyzeCSVContacts(text).drafts;
}

export function updateCSVMapping(
  mapping: CSVImportMapping,
  field: CSVImportField,
  index: number | null,
): CSVImportMapping {
  const column = index === null ? null : mapping.columns.find((candidate) => candidate.index === index) ?? null;
  const match = column ? { index: column.index, label: column.label, confidence: 1, source: "manual" as const } : null;
  const updated: CSVImportMapping = { ...mapping, [field]: match };

  if (field === "fullName" && match) {
    updated.firstName = null;
    updated.lastName = null;
  } else if ((field === "firstName" || field === "lastName") && match) {
    updated.fullName = null;
    const otherField = field === "firstName" ? "lastName" : "firstName";
    if (updated[otherField]?.index === match.index) {
      const previousMatch = mapping[field];
      updated[otherField] = previousMatch && previousMatch.index !== match.index ? previousMatch : null;
    }
  } else if (field === "phone") {
    const formerPhones = [mapping.phone, ...mapping.phoneFallbacks]
      .filter((candidate): candidate is CSVColumnMatch => Boolean(candidate))
      .filter((candidate) => candidate.index !== index);
    updated.phoneFallbacks = index === null ? [] : formerPhones;
  }

  return updated;
}
