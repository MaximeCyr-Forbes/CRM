"use client";

import { useState } from "react";
import { Building2, Check, ChevronDown, ImageIcon, Pencil, RotateCcw, X } from "lucide-react";
import type { ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import { CONFIDENCE_LABELS, formatArea, formatCurrency, getPropertySourceLabel, PROPERTY_CATEGORY_LABELS, PROPERTY_STATUS_LABELS } from "../presentation";
import { PropertyEditor } from "./property-editor";

interface PropertyCardProps {
  property: ParsedProperty;
  onChange: (data: PropertyData) => void;
}

function ReadValue({ label, value, confidence }: { label: string; value?: string | number; confidence?: string }) {
  return (
    <div className="detail-value">
      <span>{label}</span>
      <strong>{value ?? "Non détecté"}</strong>
      {confidence && <small>Confiance {confidence.toLowerCase()}</small>}
    </div>
  );
}

export function PropertyCard({ property, onChange }: PropertyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PropertyData>(structuredClone(property.data));
  const data = property.data;
  const price = data.soldPrice ?? data.askingPrice;
  const confidenceClass = `confidence-badge confidence-badge--${property.overallConfidence}`;

  function startEditing() {
    setDraft(structuredClone(data));
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraft(structuredClone(data));
    setIsEditing(false);
  }

  function saveEditing() {
    onChange(draft);
    setIsEditing(false);
  }

  return (
    <article className={`property-card${isExpanded ? " property-card--expanded" : ""}`}>
      <div className="property-card__summary">
        <div className="property-card__visual">
          {data.photos?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL manually supplied after parsing/editing.
            <img src={data.photos[0]} alt={data.address ? `Photo du ${data.address}` : "Photo de la propriété"} />
          ) : (
            <div className="property-card__placeholder">
              {data.photoDetection?.detected ? <ImageIcon size={28} /> : <Building2 size={28} />}
              <span>{data.photoDetection?.detected ? "Visuels détectés" : "Aucune photo extraite"}</span>
            </div>
          )}
        </div>

        <div className="property-card__content">
          <div className="property-card__topline">
            <span className={confidenceClass}>{property.sourceType === "manual" ? "Saisie manuelle" : `Confiance ${CONFIDENCE_LABELS[property.overallConfidence].toLowerCase()}`}</span>
            <span className="property-card__file">{getPropertySourceLabel(property)} · {property.sourceFile}</span>
          </div>
          <h3>{data.address ?? "Adresse non détectée"}</h3>
          <p className="property-card__location">{[data.city, data.postalCode].filter(Boolean).join(" · ") || "Localisation non détectée"}</p>

          <div className="property-card__meta">
            {property.documentType === "centris" && <span>Centris <strong>{data.centrisNumber ?? "—"}</strong></span>}
            {property.documentType === "jlr" && <span>Source <strong>JLR</strong></span>}
            <span>{data.propertyCategory ? PROPERTY_CATEGORY_LABELS[data.propertyCategory] : "Catégorie non détectée"}</span>
            <span>{data.status ? PROPERTY_STATUS_LABELS[data.status] : "Statut non détecté"}</span>
          </div>

          <div className="property-card__figures">
            <div><span>Prix</span><strong>{formatCurrency(price)}</strong></div>
            <div><span>Année</span><strong>{data.yearBuilt ?? "—"}</strong></div>
            <div><span>Terrain</span><strong>{formatArea(data.landArea)}</strong></div>
            {data.propertyCategory === "income_property" ? (
              <>
                <div><span>Unités</span><strong>{data.incomeProperty?.numberOfUnits ?? "—"}</strong></div>
                <div><span>Revenus bruts</span><strong>{formatCurrency(data.incomeProperty?.grossPotentialRevenue)}</strong></div>
              </>
            ) : (
              <div><span>Chambres / SDB</span><strong>{data.bedroomsTotal ?? data.bedrooms ?? "—"} / {data.bathrooms ?? "—"}</strong></div>
            )}
          </div>
        </div>
      </div>

      <button className="property-card__toggle" type="button" onClick={() => setIsExpanded((value) => !value)} aria-expanded={isExpanded}>
        {property.sourceType === "manual" ? "Voir les données" : "Voir les données extraites"}
        <ChevronDown size={16} />
      </button>

      {isExpanded && (
        <div className="property-detail">
          <div className="property-detail__header">
            <div>
              <span className="property-detail__eyebrow">Données structurées</span>
              <h4>{isEditing ? "Correction manuelle" : property.sourceType === "manual" ? "Données de la propriété" : "Lecture de la fiche"}</h4>
            </div>
            <div className="property-detail__actions">
              {isEditing ? (
                <>
                  <button className="secondary-button" type="button" onClick={cancelEditing}><X size={15} /> Annuler</button>
                  <button className="primary-button primary-button--compact" type="button" onClick={saveEditing}><Check size={15} /> Enregistrer</button>
                </>
              ) : (
                <button className="secondary-button" type="button" onClick={startEditing}><Pencil size={15} /> Modifier</button>
              )}
            </div>
          </div>

          {isEditing ? (
            <PropertyEditor idPrefix={property.id} value={draft} variant={property.sourceType === "manual" ? "manual" : "full"} onChange={setDraft} />
          ) : (
            <>
              <div className="property-detail__grid">
                <ReadValue label="Genre de propriété" value={data.propertyType} confidence={property.fieldConfidence.propertyType} />
                <ReadValue label="Type de bâtiment" value={data.buildingType} confidence={property.fieldConfidence.buildingType} />
                <ReadValue label="Prix demandé" value={formatCurrency(data.askingPrice)} confidence={property.fieldConfidence.askingPrice} />
                <ReadValue label="Prix vendu" value={formatCurrency(data.soldPrice)} confidence={property.fieldConfidence.soldPrice} />
                <ReadValue label="Évaluation totale" value={formatCurrency(data.municipalAssessment?.total)} confidence={property.fieldConfidence.municipalAssessment} />
                <ReadValue label="Chambres" value={data.bedroomsTotal ?? data.bedrooms} confidence={property.fieldConfidence.bedroomsTotal} />
                <ReadValue label="Salles de bains" value={data.bathrooms} confidence={property.fieldConfidence.bathrooms} />
                <ReadValue label="Stationnement" value={data.parking} confidence={property.fieldConfidence.parking} />
                <ReadValue label="Garage" value={data.garage} confidence={property.fieldConfidence.garage} />
                <ReadValue label="Sous-sol" value={data.basement} confidence={property.fieldConfidence.basement} />
                <ReadValue label="Zonage" value={data.zoning?.join(", ")} confidence={property.fieldConfidence.zoning} />
              </div>
              {(data.remarks || data.addendum) && (
                <div className="property-detail__text">
                  {data.remarks && <div><span>Remarques</span><p>{data.remarks}</p></div>}
                  {data.addendum && <div><span>Addenda</span><p>{data.addendum}</p></div>}
                </div>
              )}
              {property.warnings.length > 0 && (
                <div className="property-warnings">
                  <RotateCcw size={15} />
                  <div>{property.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
                </div>
              )}
              {property.debug && (
                <details className="property-debug">
                  <summary>Diagnostic du parser (développement)</summary>
                  <div>
                    <h5>Raw PDF Text</h5>
                    <pre>{property.debug.rawPdfText}</pre>
                    <h5>Parsed Property</h5>
                    <pre>{JSON.stringify(property.debug.parsedProperty, null, 2)}</pre>
                    <h5>Normalized Property</h5>
                    <pre>{JSON.stringify(property.debug.normalizedProperty, null, 2)}</pre>
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
