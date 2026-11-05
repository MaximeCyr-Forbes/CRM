"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import type { ComparableAdjustment, ParsedProperty, PropertyCategory } from "@/app/lib/tools/acm/types";
import { buildComparableAnalysis, getAdjustmentCategoryOptions } from "@/app/lib/tools/acm/features/comparables";
import {
  addDraftAdjustment,
  createComparableEditingDraft,
  removeDraftAdjustment,
  updateDraftAdjustment,
} from "../comparable-editing-draft";
import { getPropertySourceLabel, PROPERTY_STATUS_LABELS } from "../presentation";
import { formatCmaCurrency, formatSignedCurrency, REFERENCE_PRICE_SOURCE_LABELS } from "../value-presentation";
import { PropertyEditor } from "./property-editor";

interface PropertyEditingModalProps {
  property: ParsedProperty;
  subjectCategory?: PropertyCategory;
  mode: "subject" | "comparable";
  adjustments: ComparableAdjustment[];
  onSave: (draft: ReturnType<typeof createComparableEditingDraft>) => void;
  onClose: () => void;
}

function createAdjustmentId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `adjustment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function PropertyEditingModal({
  property,
  subjectCategory,
  mode,
  adjustments,
  onSave,
  onClose,
}: PropertyEditingModalProps) {
  const [draft, setDraft] = useState(() => createComparableEditingDraft(property.data, adjustments));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const categories = getAdjustmentCategoryOptions(subjectCategory ?? draft.propertyData.propertyCategory);
  const analysis = buildComparableAnalysis(property.id, draft.propertyData, draft.adjustments);
  const titleId = `property-editing-modal-${property.id}`;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  function addAdjustment() {
    setDraft((current) => addDraftAdjustment(current, {
      id: createAdjustmentId(),
      category: categories[0]?.value ?? "other",
      description: "",
      amount: null,
    }));
  }

  const heading = draft.propertyData.address ?? (draft.propertyData.centrisNumber
    ? `Centris ${draft.propertyData.centrisNumber}`
    : property.sourceFile);
  const location = [draft.propertyData.city, draft.propertyData.postalCode].filter(Boolean).join(" · ");
  const displayedPrice = draft.propertyData.soldPrice ?? draft.propertyData.askingPrice;

  return (
    <div
      className="property-editing-modal__overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="property-editing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="property-editing-modal__header">
          <div>
            <span className="property-results__eyebrow">
              {mode === "comparable" ? "Ajuster le comparable" : "Modifier la propriété sujet"}
            </span>
            <h2 id={titleId}>{heading}</h2>
            <div className="property-editing-modal__meta">
              {location && <span>{location}</span>}
              <span>{getPropertySourceLabel(property)}{property.documentType === "centris" ? ` ${draft.propertyData.centrisNumber ?? "non détecté"}` : ""}</span>
              <span>{draft.propertyData.status ? PROPERTY_STATUS_LABELS[draft.propertyData.status] : "Statut non détecté"}</span>
              <strong>{formatCmaCurrency(displayedPrice)}</strong>
            </div>
          </div>
          <button ref={closeButtonRef} className="property-editing-modal__close" type="button" onClick={onClose} aria-label="Fermer sans enregistrer">
            <X size={19} />
          </button>
        </header>

        <div className="property-editing-modal__body">
          <section className="property-editing-modal__section" aria-labelledby={`${titleId}-listing`}>
            <div className="property-editing-modal__section-heading">
              <div>
                <span>01</span>
                <h3 id={`${titleId}-listing`}>Informations du listing</h3>
              </div>
              <p>Les corrections restent locales jusqu’à l’enregistrement.</p>
            </div>
            <PropertyEditor
              idPrefix={`modal-${property.id}`}
              value={draft.propertyData}
              variant={property.sourceType === "manual" ? "manual" : "comparison"}
              onChange={(propertyData) => setDraft((current) => ({ ...current, propertyData }))}
            />
          </section>

          {mode === "comparable" && (
            <section className="property-editing-modal__section" aria-labelledby={`${titleId}-adjustments`}>
              <div className="property-editing-modal__section-heading">
                <div>
                  <span>02</span>
                  <h3 id={`${titleId}-adjustments`}>Ajustements de valeur</h3>
                </div>
                <p>Les montants sont déterminés uniquement par le courtier.</p>
              </div>

              <div className="adjustment-guidance">
                <strong>Sens des ajustements</strong>
                <span>Comparable inférieur au sujet : ajustement positif possible.</span>
                <span>Comparable supérieur au sujet : ajustement négatif possible.</span>
                <small>Cette aide n’impose aucun montant ni aucune règle automatique.</small>
              </div>

              <div className="adjustment-reference">
                <span>{analysis.referencePriceSource ? REFERENCE_PRICE_SOURCE_LABELS[analysis.referencePriceSource] : "Aucun prix exploitable"}</span>
                <strong>{formatCmaCurrency(analysis.referencePrice)}</strong>
                <small>Le prix original demeure inchangé.</small>
              </div>

              <div className="adjustment-list">
                <div className="adjustment-list__heading">
                  <span>Catégorie</span>
                  <span>Description</span>
                  <span>Montant</span>
                  <span aria-hidden="true" />
                </div>
                {draft.adjustments.length === 0 ? (
                  <div className="adjustment-list__empty">Aucun ajustement ajouté à ce comparable.</div>
                ) : draft.adjustments.map((adjustment, index) => (
                  <div className="adjustment-row" key={adjustment.id}>
                    <label>
                      <span>Catégorie</span>
                      <select
                        aria-label={`Catégorie de l’ajustement ${index + 1}`}
                        value={adjustment.category}
                        onChange={(event) => setDraft((current) => updateDraftAdjustment(current, adjustment.id, { category: event.target.value as ComparableAdjustment["category"] }))}
                      >
                        {categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Description</span>
                      <input
                        aria-label={`Description de l’ajustement ${index + 1}`}
                        value={adjustment.description}
                        placeholder={adjustment.category === "other" ? "Description requise" : "Précision facultative"}
                        onChange={(event) => setDraft((current) => updateDraftAdjustment(current, adjustment.id, { description: event.target.value }))}
                      />
                      {adjustment.category === "other" && !adjustment.description.trim() && <small>Ajoutez une courte description.</small>}
                    </label>
                    <label>
                      <span>Montant</span>
                      <input
                        className={adjustment.amount !== null && adjustment.amount < 0 ? "adjustment-amount--negative" : "adjustment-amount--positive"}
                        aria-label={`Montant de l’ajustement ${index + 1}`}
                        type="number"
                        step="500"
                        value={adjustment.amount ?? ""}
                        placeholder="Ex. 15000 ou -10000"
                        onChange={(event) => {
                          const amount = event.target.value === "" ? null : Number(event.target.value);
                          setDraft((current) => updateDraftAdjustment(current, adjustment.id, { amount: Number.isFinite(amount) ? amount : null }));
                        }}
                      />
                      {adjustment.amount === null && <small>Inscrivez un montant numérique.</small>}
                    </label>
                    <button type="button" onClick={() => setDraft((current) => removeDraftAdjustment(current, adjustment.id))} aria-label={`Supprimer l’ajustement ${index + 1}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <button className="adjustment-add-button" type="button" onClick={addAdjustment}><Plus size={15} /> Ajouter un ajustement</button>

              <div className="adjustment-totals">
                <div><span>Total des ajustements</span><strong>{formatSignedCurrency(analysis.totalAdjustments)}</strong></div>
                <div className="adjustment-totals__adjusted">
                  <span>Prix ajusté</span>
                  <strong>{formatCmaCurrency(analysis.adjustedPrice)}</strong>
                  {analysis.adjustedPrice !== null && analysis.adjustedPrice < 0 && <small>Vérifiez les ajustements : le prix ajusté est négatif.</small>}
                </div>
              </div>
            </section>
          )}
        </div>

        <footer className="property-editing-modal__footer">
          <span>Échap ferme la fenêtre sans conserver les changements.</span>
          <div>
            <button className="secondary-button" type="button" onClick={onClose}><X size={15} /> Annuler</button>
            <button className="primary-button primary-button--compact" type="button" onClick={() => onSave(draft)}><Check size={15} /> Enregistrer les modifications</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
