"use client";

import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  LISTING_PROPERTY_TYPE_LABELS,
  LISTING_PURPOSE_LABELS,
  LISTING_STATUS_LABELS,
  type ListingDraft,
} from "../data/listing-types";
import {
  applyCentrisListingImport,
  buildCentrisListingImportPreview,
  defaultCentrisListingImportSelection,
  type CentrisListingImportField,
  type CentrisListingImportSelection,
} from "../lib/centris-pdf/listing-form-import";
import type { CentrisConfidence, CentrisParseResult } from "../lib/centris-pdf/types";

type ImportStatus = "idle" | "loading" | "success" | "error";
type ImportErrorKind = "reading" | "no_text" | "unrecognized";

class CentrisListingImportError extends Error {
  constructor(message: string, public readonly kind: ImportErrorKind) {
    super(message);
    this.name = "CentrisListingImportError";
  }
}

const fieldLabels: Record<CentrisListingImportField, string> = {
  address: "Adresse",
  centrisNumber: "Numéro Centris",
  propertyType: "Type de propriété",
  purpose: "Type de mandat",
  price: "Prix demandé / loyer",
  status: "Statut",
  generalNotes: "Ajouter les informations Centris aux notes",
};

const confidenceLabels: Record<CentrisConfidence, string> = {
  high: "Élevée",
  medium: "Moyenne",
  low: "À vérifier",
};

function formatMoney(value: number | null) {
  return value === null
    ? "—"
    : `${new Intl.NumberFormat("fr-CA", { maximumFractionDigits: 2 }).format(value)} $`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function priceLabel(result: CentrisParseResult) {
  if (result.pricing.mode === "monthly_rent") return `${formatMoney(result.pricing.monthlyAmount)} / mois`;
  if (result.pricing.mode === "annual_per_square_foot") {
    return `${formatMoney(result.pricing.annualPerSquareFootAmount)} / année / pi²`;
  }
  return formatMoney(result.pricing.amount);
}

function purposeLabel(result: CentrisParseResult) {
  if (result.pricing.detectedPurpose === "rental") return "LOCATION";
  if (result.pricing.detectedPurpose === "sale") return "VENTE";
  return "TYPE DE MANDAT À VÉRIFIER";
}

function marketStatusLabel(result: CentrisParseResult) {
  if (result.centrisMarketStatus === "active") return "ACTIF";
  if (result.centrisMarketStatus === "sold") return "VENDU";
  if (result.centrisMarketStatus === "rented") return "LOUÉ";
  return result.centrisMarketStatusRaw || "À vérifier";
}

function overallConfidence(result: CentrisParseResult): CentrisConfidence {
  const values = ["centrisNumber", "address", "propertyType", "price", "centrisMarketStatus"]
    .map((key) => result.confidence[key] ?? "low");
  if (values.includes("low")) return "low";
  return values.includes("medium") ? "medium" : "high";
}

function valueLabel(field: CentrisListingImportField, value: string | number | null) {
  if (value === null || String(value).trim() === "") return "Non renseignée";
  if (field === "generalNotes") return "Résumé structuré de la fiche";
  if (field === "price" && typeof value === "number") return formatMoney(value);
  return String(value);
}

function apiError(value: unknown) {
  if (!value || typeof value !== "object") {
    return { message: "La fiche Centris n’a pas pu être analysée.", kind: "reading" as const };
  }
  const payload = value as { error?: unknown; code?: unknown };
  const message = typeof payload.error === "string" && payload.error.trim()
    ? payload.error
    : "La fiche Centris n’a pas pu être analysée.";
  if (payload.code === "no_text") return { message, kind: "no_text" as const };
  if (["invalid_pdf", "unsupported_pdf", "pdf_runtime_error", "parse_failed"].includes(String(payload.code))) {
    return { message, kind: "reading" as const };
  }
  return { message, kind: "unrecognized" as const };
}

export function CentrisListingImport({
  currentValues,
  disabled = false,
  onApply,
}: {
  currentValues: ListingDraft;
  disabled?: boolean;
  onApply: (
    values: ListingDraft,
    result: CentrisParseResult,
    selection: CentrisListingImportSelection,
  ) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [fileName, setFileName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<ImportErrorKind>("reading");
  const [result, setResult] = useState<CentrisParseResult | null>(null);
  const [selection, setSelection] = useState<CentrisListingImportSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const previewFields = useMemo(
    () => result ? buildCentrisListingImportPreview(currentValues, result) : [],
    [currentValues, result],
  );

  function resetInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePDF() {
    setStatus("idle");
    setFileName("");
    setErrorMessage("");
    setErrorKind("reading");
    setResult(null);
    setSelection(null);
    setIsDragging(false);
    setIsApplied(false);
    resetInput();
  }

  async function analyze(file: File) {
    setStatus("loading");
    setFileName(file.name);
    setErrorMessage("");
    setErrorKind("reading");
    setResult(null);
    setSelection(null);
    setIsDragging(false);
    setIsApplied(false);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/centris/parse", { method: "POST", body: formData });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = apiError(payload);
        throw new CentrisListingImportError(failure.message, failure.kind);
      }
      const parsed = (payload as { data?: CentrisParseResult } | null)?.data;
      if (!parsed) throw new Error("La fiche Centris n’a retourné aucune information exploitable.");
      setResult(parsed);
      setSelection(defaultCentrisListingImportSelection(currentValues, parsed));
      setStatus("success");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "La fiche Centris n’a pas pu être analysée.");
      setErrorKind(error instanceof CentrisListingImportError ? error.kind : "reading");
      setStatus("error");
    } finally {
      resetInput();
    }
  }

  function chooseFile() {
    if (status !== "loading" && !disabled) inputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (status === "loading" || disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) void analyze(file);
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    chooseFile();
  }

  function toggleField(field: CentrisListingImportField) {
    setSelection((current) => current ? { ...current, [field]: !current[field] } : current);
    setIsApplied(false);
  }

  function applySelection() {
    if (!result || !selection) return;
    onApply(applyCentrisListingImport(currentValues, result, selection), result, selection);
    setIsApplied(true);
  }

  const details = result ? [
    ["Genre de propriété", result.property.genreRaw],
    ["Type normalisé", LISTING_PROPERTY_TYPE_LABELS[result.property.normalizedType]],
    ["Mandat détecté", result.pricing.detectedPurpose === "unknown" ? null : LISTING_PURPOSE_LABELS[result.pricing.detectedPurpose]],
    ["Statut proposé", result.centrisMarketStatus === "unknown" ? null : LISTING_STATUS_LABELS[result.centrisMarketStatus]],
    ["Année", result.property.yearBuilt],
    ["Nombre d’unités", result.property.numberOfUnits],
    ["Pièces", result.property.numberOfRooms],
    ["Salles de bains", result.property.bathrooms],
    ["Superficie habitable", result.property.livingAreaSqFt ? `${result.property.livingAreaSqFt} pi²` : null],
    ["Superficie bâtiment", result.property.buildingAreaSqFt ? `${result.property.buildingAreaSqFt} pi²` : null],
    ["Superficie disponible", result.property.availableAreaSqFt ? `${result.property.availableAreaSqFt} pi²` : null],
    ["Superficie terrain", result.property.landAreaSqFt ? `${result.property.landAreaSqFt} pi²` : null],
    ["Revenus bruts potentiels", result.financial.grossPotentialRevenueAnnual ? `${formatMoney(result.financial.grossPotentialRevenueAnnual)} / année` : null],
    ["Revenus nets", result.financial.netOperatingIncomeAnnual ? `${formatMoney(result.financial.netOperatingIncomeAnnual)} / année` : null],
    ["TPS/TVQ", result.pricing.taxesApplicable === true ? "Applicables" : null],
  ].filter((item): item is [string, string | number] => item[1] !== null && item[1] !== "") : [];

  return (
    <section className="transaction-centris-import listing-centris-import" aria-labelledby="listing-centris-title">
      <div className="transaction-centris-heading">
        <p className="section-kicker" id="listing-centris-title">DÉPOSER UNE FICHE CENTRIS</p>
        <p>Importez une fiche client Centris pour préremplir ce nouveau Listing.</p>
        <small>Vous pourrez comparer, sélectionner et modifier toutes les informations avant la création.</small>
      </div>
      <input
        accept="application/pdf,.pdf"
        aria-label="Choisir une fiche Centris PDF pour le Listing"
        className="sr-only"
        disabled={disabled || status === "loading"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void analyze(file);
        }}
        ref={inputRef}
        type="file"
      />

      {(status === "idle" || status === "error") && (
        <div
          aria-label="Déposer ou choisir une fiche Centris PDF pour le Listing"
          className={`transaction-centris-dropzone${isDragging ? " is-dragging" : ""}`}
          onClick={chooseFile}
          onDragEnter={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onKeyDown={handleDropzoneKeyDown}
          role="button"
          tabIndex={disabled ? -1 : 0}
        >
          {status === "error" ? (
            <div className="transaction-centris-error" role="alert">
              <strong>{errorKind === "no_text" ? "PDF SANS TEXTE LISIBLE" : errorKind === "reading" ? "ERREUR DE LECTURE DU PDF" : "FICHE CENTRIS NON RECONNUE"}</strong>
              <p>{errorMessage}</p>
              <span className="transaction-centris-file-button">CHOISIR UN AUTRE PDF</span>
            </div>
          ) : (
            <div>
              <strong>Déposez une fiche Centris PDF ici</strong>
              <span>Glisser-déposer ou sélectionner un fichier</span>
              <span className="transaction-centris-file-button">CHOISIR UN PDF</span>
            </div>
          )}
        </div>
      )}

      {status === "loading" && (
        <div className="transaction-centris-dropzone is-loading" aria-live="polite">
          <span className="transaction-centris-spinner" aria-hidden="true" />
          <strong>ANALYSE DE LA FICHE CENTRIS…</strong>
          <span>{fileName}</span>
        </div>
      )}

      {status === "success" && result && selection && (
        <div className={`transaction-centris-preview${isApplied ? " is-applied" : ""}`}>
          <div className="transaction-centris-preview-heading">
            <div>
              <strong>{result.isRecognizedCentrisDocument ? "FICHE CENTRIS ANALYSÉE" : "FICHE CENTRIS NON RECONNUE"} <span aria-label="Analyse terminée">✓</span></strong>
              <span>No Centris {result.centrisNumber || "non détecté"}</span>
            </div>
            <span>{fileName}</span>
          </div>

          <div className="transaction-centris-summary">
            <div><span>Adresse détectée</span><strong>{result.address.fullAddress || "Adresse à vérifier"}</strong></div>
            <div>
              <span>{result.property.genreRaw || LISTING_PROPERTY_TYPE_LABELS[result.property.normalizedType]}</span>
              <strong>{purposeLabel(result)}</strong>
              <b>{priceLabel(result)}</b>
              {result.pricing.taxesApplicable === true && <small>TPS/TVQ applicables</small>}
            </div>
            <div>
              <span>Statut Centris</span>
              <strong>{marketStatusLabel(result)}</strong>
              <small>Confiance : {confidenceLabels[overallConfidence(result)]}</small>
            </div>
          </div>

          {result.property.intergenerational === true && (
            <p className="transaction-centris-highlight"><strong>INTERGÉNÉRATION</strong>{result.financial.supplementalRevenueMonthly ? ` · Revenu supplémentaire : ${formatMoney(result.financial.supplementalRevenueMonthly)} / mois` : ""}</p>
          )}

          {!result.isRecognizedCentrisDocument && (
            <p className="transaction-centris-warning" role="alert">Cette fiche ne semble pas être une fiche client Centris reconnue. Sélectionnez seulement les champs fiables.</p>
          )}

          {result.pricing.mode === "annual_per_square_foot" && (
            <div className="transaction-centris-warning" role="alert">
              <strong>TARIF COMMERCIAL DÉTECTÉ</strong>
              <p>{priceLabel(result)}. Le montant mensuel doit être confirmé manuellement; le loyer actuel ne sera pas remplacé.</p>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="transaction-centris-warning" role="alert">
              <strong>À VÉRIFIER</strong>
              <ul>{result.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}

          {isApplied ? (
            <div className="transaction-centris-applied" aria-live="polite">
              <strong>Informations Centris appliquées ✓</strong>
              <span>Les champs du Listing restent entièrement modifiables.</span>
            </div>
          ) : (
            <div className="transaction-centris-choices">
              {previewFields.map((item) => {
                const unavailableForUnrecognized = !result.isRecognizedCentrisDocument && item.confidence === "low";
                return (
                  <label className="transaction-centris-field-choice" key={item.field}>
                    <input
                      checked={selection[item.field]}
                      disabled={!item.available || unavailableForUnrecognized}
                      onChange={() => toggleField(item.field)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{fieldLabels[item.field]}</strong>
                      {item.hasConflict && <em>VALEUR DÉJÀ RENSEIGNÉE</em>}
                      {item.hasConflict && <small>Actuel : {valueLabel(item.field, item.currentValue)}</small>}
                      <small>Centris : {valueLabel(item.field, item.centrisValue)}</small>
                    </span>
                    <em>{item.confidence === "low" ? "À vérifier" : confidenceLabels[item.confidence]}</em>
                  </label>
                );
              })}
            </div>
          )}

          <details className="transaction-centris-details">
            <summary>VOIR LES INFORMATIONS DÉTECTÉES</summary>
            {details.length > 0 && <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
            {result.rentalUnits.length > 0 && (
              <div className="transaction-centris-units">
                <h4>UNITÉS LOCATIVES</h4>
                {result.rentalUnits.map((unit, index) => (
                  <article key={`${unit.unitNumber}-${index}`}>
                    <strong>{unit.unitNumber || `Logement ${index + 1}`}</strong>
                    <span>{[unit.rooms ? `${unit.rooms} pièces` : "", unit.bedrooms ? `${unit.bedrooms} chambres` : ""].filter(Boolean).join(" · ")}</span>
                    {unit.monthlyRent !== null && <span>{formatMoney(unit.monthlyRent)} / mois</span>}
                    {unit.leaseEndDate && <small>Bail jusqu’au {formatDate(unit.leaseEndDate)}</small>}
                  </article>
                ))}
              </div>
            )}
            <div className="transaction-centris-sections">
              {Object.entries(result.sections).filter(([, content]) => content).map(([name, content]) => (
                <details key={name}><summary>{name === "addendum" ? "Addenda" : name.charAt(0).toUpperCase() + name.slice(1)}</summary><p>{content}</p></details>
              ))}
            </div>
          </details>

          <div className="transaction-centris-actions">
            {isApplied ? (
              <button onClick={() => setIsApplied(false)} type="button">Modifier la sélection</button>
            ) : (
              <button className="transaction-centris-apply" disabled={!Object.values(selection).some(Boolean)} onClick={applySelection} type="button">Appliquer les informations sélectionnées</button>
            )}
            <button disabled={disabled} onClick={chooseFile} type="button">Analyser une autre fiche</button>
            <button onClick={removePDF} type="button">Retirer</button>
          </div>
        </div>
      )}
    </section>
  );
}
