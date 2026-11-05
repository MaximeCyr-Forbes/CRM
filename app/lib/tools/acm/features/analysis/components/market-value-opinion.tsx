"use client";

import type { MarketValueOpinion } from "@/app/lib/tools/acm/types";
import { validateMarketValueOpinion } from "@/app/lib/tools/acm/features/comparables";

interface MarketValueOpinionProps {
  value: MarketValueOpinion;
  onChange: (value: MarketValueOpinion) => void;
}

type NumericOpinionField = "minimumValue" | "maximumValue" | "recommendedValue";

const FIELDS: Array<{ key: NumericOpinionField; label: string; hint: string }> = [
  { key: "minimumValue", label: "Valeur minimale", hint: "Borne inférieure choisie par le courtier" },
  { key: "maximumValue", label: "Valeur maximale", hint: "Borne supérieure choisie par le courtier" },
  { key: "recommendedValue", label: "Valeur recommandée", hint: "Opinion finale, indépendante du milieu mathématique" },
];

export function MarketValueOpinionSection({ value, onChange }: MarketValueOpinionProps) {
  const errors = validateMarketValueOpinion(value);

  function updateNumber(field: NumericOpinionField, rawValue: string) {
    onChange({ ...value, [field]: rawValue === "" ? undefined : Number(rawValue) });
  }

  return (
    <section className="market-opinion" aria-labelledby="market-opinion-title">
      <div className="market-opinion__intro">
        <span className="property-results__eyebrow">Décision professionnelle</span>
        <h3 id="market-opinion-title">Opinion de valeur</h3>
        <p>Ces trois montants sont saisis manuellement et ne sont jamais remplacés par les calculs de l’application.</p>
      </div>

      <div className="market-opinion__fields">
        {FIELDS.map((field) => (
          <label className={field.key === "recommendedValue" ? "market-opinion-field market-opinion-field--recommended" : "market-opinion-field"} key={field.key}>
            <span>{field.label}</span>
            <div><input type="number" min="0" step="1000" value={value[field.key] ?? ""} placeholder="0" onChange={(event) => updateNumber(field.key, event.target.value)} /><b>$</b></div>
            <small>{errors[field.key] ?? field.hint}</small>
          </label>
        ))}
      </div>

      <label className="market-opinion__comment">
        <span>Commentaire sur l’analyse</span>
        <textarea
          rows={6}
          value={value.brokerComment}
          placeholder="Saisissez ici votre analyse et les éléments qui soutiennent votre opinion de valeur."
          onChange={(event) => onChange({ ...value, brokerComment: event.target.value })}
        />
        <small>Le commentaire est entièrement rédigé par le courtier.</small>
      </label>
    </section>
  );
}
