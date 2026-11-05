"use client";

import type { ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import { PropertyCard } from "./property-card";

interface PropertyResultsProps {
  properties: ParsedProperty[];
  onPropertyChange: (id: string, data: PropertyData) => void;
  onOpenCma: () => void;
}

export function PropertyResults({ properties, onPropertyChange, onOpenCma }: PropertyResultsProps) {
  if (properties.length === 0) return null;

  return (
    <section className="property-results" aria-labelledby="results-title">
      <div className="property-results__header">
        <div>
          <span className="property-results__eyebrow">Étape 02</span>
          <h2 id="results-title">Propriétés analysées</h2>
        </div>
        <p>{properties.length} {properties.length > 1 ? "fiches converties" : "fiche convertie"} en données structurées</p>
      </div>
      <div className="property-results__list">
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            onChange={(data) => onPropertyChange(property.id, data)}
          />
        ))}
      </div>
      <div className="property-results__continue">
        <button className="primary-button" type="button" onClick={onOpenCma}>Ouvrir Nouvelle ACM</button>
      </div>
    </section>
  );
}
