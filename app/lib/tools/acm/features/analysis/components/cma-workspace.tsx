"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, FilePlus2, LoaderCircle, Pencil, Plus, RotateCcw, X } from "lucide-react";
import type { ParsedProperty, PropertyData, SavedAnalysis } from "@/app/lib/tools/acm/types";
import {
  assignPropertyPosition,
  calculateDerivedMetrics,
  changeSubject,
  excludeComparable,
  getComparisonRows,
  moveComparable,
  prepareCmaReportData,
  reinstateComparable,
} from "@/app/lib/tools/acm/features/comparables";
import type { CmaWorkspaceState, ComparisonSelection } from "@/app/lib/tools/acm/features/comparables";
import { getPropertySourceLabel, PROPERTY_CATEGORY_LABELS } from "../presentation";
import { commitComparableEditingDraft } from "../comparable-editing-draft";
import type { ManualPropertyRole } from "../manual-property";
import { AnalysisSummary } from "./analysis-summary";
import { ManualPropertyModal } from "./manual-property-modal";
import { MarketValueOpinionSection } from "./market-value-opinion";
import { PropertyEditingModal } from "./property-editing-modal";
import { ReportActions } from "@/app/lib/tools/acm/features/reports/components/report-actions";
import { EmailDraftSection } from "@/app/lib/tools/acm/features/emails/components/email-draft-section";
import { updateEmailDraftPreparer } from "@/app/lib/tools/acm/features/emails";
import { AnalysisPersistenceBar } from "@/app/lib/tools/acm/features/analyses/components/analysis-persistence-bar";
import { useAnalysisPersistence } from "@/app/lib/tools/acm/features/analyses/hooks/use-analysis-persistence";
import { ComparableMapSection } from "@/app/lib/tools/acm/features/maps/components/comparable-map-section";
import { formatComparisonValue } from "../comparison-format";

interface CmaWorkspaceProps {
  properties: ParsedProperty[];
  analysisState: CmaWorkspaceState;
  onAnalysisStateChange: (state: CmaWorkspaceState) => void;
  onPropertyChange: (id: string, data: PropertyData) => void;
  onBack: () => void;
  initialAnalysis?: SavedAnalysis;
  onAddPropertyFiles?: (files: File[]) => Promise<{ added: number; errors: string[] }>;
  onAddManualProperty?: (data: PropertyData, role: ManualPropertyRole) => void;
  onAddJlrComparable?: (property: ParsedProperty) => void;
  suggestedSubjectId?: string;
}

function propertyLabel(property: ParsedProperty): string {
  return property.data.address ?? (property.data.centrisNumber ? `Centris ${property.data.centrisNumber}` : property.sourceFile);
}

interface PropertyPositionMenuProps {
  currentPosition: number;
  isSubject: boolean;
  onSelect: (position: number) => void;
  propertyName: string;
  totalPositions: number;
}

function positionLabel(position: number): string {
  return position === 0 ? "Sujet" : `Comparable ${position}`;
}

function PropertyPositionMenu({ currentPosition, isSubject, onSelect, propertyName, totalPositions }: PropertyPositionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="comparison-position-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className={`comparison-column-header__role${isSubject ? " comparison-column-header__role--subject" : ""}`}
        type="button"
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Attribuer une position à ${propertyName}. Position actuelle : ${positionLabel(currentPosition)}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        {positionLabel(currentPosition)}
        <ChevronDown size={10} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="comparison-position-menu__popover" id={menuId} role="menu" aria-label={`Rôle de ${propertyName}`}>
          <span>Rôle dans l’analyse</span>
          {Array.from({ length: totalPositions }, (_, position) => (
            <button
              key={position}
              type="button"
              role="menuitemradio"
              aria-checked={position === currentPosition}
              onClick={() => {
                onSelect(position);
                setIsOpen(false);
              }}
            >
              {positionLabel(position)}
              {position === currentPosition && <Check size={12} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CmaWorkspace({ properties, analysisState, onAnalysisStateChange, onPropertyChange, onBack, initialAnalysis, onAddPropertyFiles, onAddManualProperty, onAddJlrComparable, suggestedSubjectId }: CmaWorkspaceProps) {
  const addComparableInputRef = useRef<HTMLInputElement>(null);
  const subjectSelectRef = useRef<HTMLSelectElement>(null);
  const [hiddenRowIds, setHiddenRowIds] = useState<string[]>([]);
  const [editingModal, setEditingModal] = useState<{ propertyId: string; mode: "subject" | "comparable" } | null>(null);
  const [isManualPropertyModalOpen, setIsManualPropertyModalOpen] = useState(false);
  const [isAddingComparables, setIsAddingComparables] = useState(false);
  const [addComparableMessage, setAddComparableMessage] = useState("");
  const [showSubjectSuggestion, setShowSubjectSuggestion] = useState(Boolean(suggestedSubjectId));

  const selection = analysisState.selection;
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const subject = propertyById.get(selection.subjectId) ?? properties[0];
  const comparables = selection.comparableIds.map((id) => propertyById.get(id)).filter((property): property is ParsedProperty => Boolean(property));
  const excluded = selection.excludedIds.map((id) => propertyById.get(id)).filter((property): property is ParsedProperty => Boolean(property));
  const rows = getComparisonRows(subject?.data.propertyCategory);
  const visibleRows = rows.filter((row) => !hiddenRowIds.includes(row.id));
  const hiddenRows = rows.filter((row) => hiddenRowIds.includes(row.id));
  const comparedProperties = subject ? [subject, ...comparables] : [];
  const modalProperty = editingModal ? propertyById.get(editingModal.propertyId) : undefined;
  const reportData = subject
    ? prepareCmaReportData(subject, comparables, analysisState.adjustmentsByPropertyId, analysisState.opinion, analysisState.preparedBy)
    : null;
  const persistence = useAnalysisPersistence({ properties, workspaceState: analysisState, initialAnalysis });

  async function addComparableFiles(files: File[]) {
    if (!onAddPropertyFiles || files.length === 0) return;
    setIsAddingComparables(true);
    setAddComparableMessage("");
    const result = await onAddPropertyFiles(files);
    setAddComparableMessage(result.errors.length > 0
      ? result.errors.join(" ")
      : `${result.added} ${result.added === 1 ? "comparable ajouté" : "comparables ajoutés"}.`);
    setIsAddingComparables(false);
  }

  function setSelection(update: (current: ComparisonSelection) => ComparisonSelection) {
    onAnalysisStateChange({ ...analysisState, selection: update(selection) });
  }

  function selectSubject(nextSubjectId: string) {
    setSelection((current) => changeSubject(current, nextSubjectId));
    setEditingModal(null);
    setShowSubjectSuggestion(false);
  }

  function hideRow(id: string) {
    setHiddenRowIds((current) => current.includes(id) ? current : [...current, id]);
  }

  function showRow(id: string) {
    setHiddenRowIds((current) => current.filter((rowId) => rowId !== id));
  }

  if (!subject) return null;

  return (
    <section className="cma-workspace" id="nouvelle-acm" aria-labelledby="cma-title">
      <div className="cma-workspace__topbar">
        <button className="cma-back-button" type="button" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> Retour aux fiches
        </button>
        <span>Étape 03 · Espace de comparaison</span>
      </div>

      <header className="cma-workspace__header">
        <div>
          <span className="property-results__eyebrow">Analyse comparative de marché</span>
          <h2 id="cma-title">Nouvelle ACM</h2>
          <p>Organisez les propriétés et comparez uniquement les données disponibles.</p>
        </div>
        <div className="cma-workspace__header-actions">
          {onAddPropertyFiles && (
            <>
              <input ref={addComparableInputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => {
                void addComparableFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }} />
              <button className="secondary-button" type="button" disabled={isAddingComparables} onClick={() => addComparableInputRef.current?.click()}>
                {isAddingComparables ? <LoaderCircle className="spin" size={15} /> : <FilePlus2 size={15} />}
                {isAddingComparables ? "Analyse…" : "Ajouter un comparable"}
              </button>
            </>
          )}
          {onAddManualProperty && (
            <button className="secondary-button" type="button" onClick={() => setIsManualPropertyModalOpen(true)}>
              <Plus size={15} /> Ajouter un comparable manuellement
            </button>
          )}
          <div className="cma-workspace__status" aria-label={`${comparables.length} comparables inclus`}>
            <strong>{comparables.length}</strong>
            <span>{comparables.length === 1 ? "comparable inclus" : "comparables inclus"}</span>
          </div>
        </div>
      </header>

      {addComparableMessage && <p className="cma-workspace__inline-message" role="status">{addComparableMessage}</p>}

      <AnalysisPersistenceBar
        title={persistence.title}
        status={persistence.status}
        saveState={persistence.saveState}
        lastSavedAt={persistence.lastSavedAt}
        errorMessage={persistence.errorMessage}
        opinion={analysisState.opinion}
        preparedBy={analysisState.preparedBy}
        onTitleChange={persistence.setTitle}
        onSave={persistence.saveNow}
        onPreparedByChange={(preparedBy) => {
          const emailDraft = updateEmailDraftPreparer(analysisState.emailDraft, preparedBy);
          onAnalysisStateChange({ ...analysisState, preparedBy, emailDraft });
        }}
        onStatusChange={persistence.changeStatus}
      />

      <div className="subject-selector">
        <div className="subject-selector__copy">
          <span>Propriété sujet</span>
          <strong>Choisissez la propriété dont la valeur sera étudiée</strong>
        </div>
        <label htmlFor="cma-subject-select">
          <span>Fiche sélectionnée</span>
          <select ref={subjectSelectRef} id="cma-subject-select" value={subject.id} onChange={(event) => selectSubject(event.target.value)}>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>{propertyLabel(property)}</option>
            ))}
          </select>
        </label>
      </div>

      {showSubjectSuggestion && suggestedSubjectId === subject.id && (
        <div className="subject-suggestion" role="status">
          <span>Propriété sujet suggérée à partir du feuillet JLR</span>
          <button type="button" onClick={() => subjectSelectRef.current?.focus()}>Changer</button>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="excluded-comparables" aria-label="Comparables exclus">
          <div>
            <span>Comparables exclus</span>
            <small>Ils ne figurent pas dans le tableau.</small>
          </div>
          <div className="excluded-comparables__items">
            {excluded.map((property) => (
              <button key={property.id} type="button" onClick={() => setSelection((current) => reinstateComparable(current, property.id))}>
                <RotateCcw size={13} aria-hidden="true" /> Réintégrer {propertyLabel(property)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="comparison-panel">
        <div className="comparison-panel__toolbar">
          <div>
            <h3>Tableau comparatif</h3>
            <p>{subject.data.propertyCategory ? PROPERTY_CATEGORY_LABELS[subject.data.propertyCategory] : "Catégorie non déterminée"} · lignes adaptées au sujet</p>
          </div>
          {hiddenRows.length > 0 && (
            <div className="hidden-rows">
              <span>{hiddenRows.length} {hiddenRows.length === 1 ? "ligne masquée" : "lignes masquées"}</span>
              {hiddenRows.map((row) => (
                <button key={row.id} type="button" onClick={() => showRow(row.id)}><Eye size={13} /> {row.label}</button>
              ))}
            </div>
          )}
        </div>

        <div className="comparison-table-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th className="comparison-table__criteria" scope="col">
                  <span>Critères</span>
                  <small>{visibleRows.length} lignes visibles</small>
                </th>
                {comparedProperties.map((property, index) => {
                  const isSubject = index === 0;
                  const comparableIndex = index - 1;
                  return (
                    <th className={isSubject ? "comparison-table__subject" : undefined} key={property.id} scope="col">
                      <div className="comparison-column-header">
                        <PropertyPositionMenu
                          currentPosition={index}
                          isSubject={isSubject}
                          propertyName={propertyLabel(property)}
                          totalPositions={comparedProperties.length}
                          onSelect={(position) => setSelection((current) => assignPropertyPosition(current, property.id, position))}
                        />
                        <strong>{propertyLabel(property)}</strong>
                        <small>{getPropertySourceLabel(property)}{property.documentType === "centris" ? ` ${property.data.centrisNumber ?? "non détecté"}` : ""}</small>
                        <div className="comparison-column-header__actions">
                          {!isSubject && (
                            <>
                              <button type="button" disabled={comparableIndex === 0} onClick={() => setSelection((current) => moveComparable(current, property.id, -1))} aria-label={`Déplacer ${propertyLabel(property)} vers la gauche`}><ChevronLeft size={14} /></button>
                              <button type="button" disabled={comparableIndex === comparables.length - 1} onClick={() => setSelection((current) => moveComparable(current, property.id, 1))} aria-label={`Déplacer ${propertyLabel(property)} vers la droite`}><ChevronRight size={14} /></button>
                              <button type="button" onClick={() => {
                                setSelection((current) => excludeComparable(current, property.id));
                                if (editingModal?.propertyId === property.id) setEditingModal(null);
                              }} aria-label={`Exclure ${propertyLabel(property)}`}><X size={14} /></button>
                              <button className="comparison-column-header__adjust" type="button" onClick={() => setEditingModal({ propertyId: property.id, mode: "comparable" })}>Ajuster ce comparable</button>
                            </>
                          )}
                          {isSubject && (
                            <button type="button" onClick={() => setEditingModal({ propertyId: property.id, mode: "subject" })} aria-label={`Modifier ${propertyLabel(property)}`}><Pencil size={13} /> Modifier</button>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <th scope="row">
                    {(rowIndex === 0 || visibleRows[rowIndex - 1]?.group !== row.group) && <small>{row.group}</small>}
                    <span>{row.label}</span>
                    <button type="button" onClick={() => hideRow(row.id)} aria-label={`Masquer la ligne ${row.label}`} title="Masquer cette ligne"><EyeOff size={13} /></button>
                  </th>
                  {comparedProperties.map((property, index) => {
                    const data = property.data;
                    const metrics = calculateDerivedMetrics(data);
                    return (
                      <td className={index === 0 ? "comparison-table__subject" : undefined} key={property.id}>
                        {formatComparisonValue(row, row.value(data, metrics))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reportData && <AnalysisSummary report={reportData} onAdjust={(propertyId) => setEditingModal({ propertyId, mode: "comparable" })} />}

      <ComparableMapSection
        subject={subject}
        comparables={comparables}
        onCoordinatesResolved={(propertyId, location) => {
          const property = propertyById.get(propertyId);
          if (!property) return;
          const currentData = { ...property.data };
          delete currentData.coordinates;
          delete currentData.geocoding;
          onPropertyChange(propertyId, { ...currentData, geo: location.geo });
        }}
      />

      <MarketValueOpinionSection
        value={analysisState.opinion}
        onChange={(opinion) => onAnalysisStateChange({ ...analysisState, opinion })}
      />

      {reportData && <ReportActions report={reportData} />}

      {reportData && (
        <EmailDraftSection
          report={reportData}
          draft={analysisState.emailDraft}
          onChange={(emailDraft) => onAnalysisStateChange({ ...analysisState, emailDraft })}
        />
      )}

      <div className="cma-workspace__notice">
        Les prix ajustés et les statistiques sont des outils d’aide. Seuls les montants saisis dans « Opinion de valeur » représentent l’opinion du courtier.
      </div>

      {editingModal && modalProperty && (
        <PropertyEditingModal
          key={`${editingModal.mode}-${modalProperty.id}`}
          property={modalProperty}
          subjectCategory={subject.data.propertyCategory}
          mode={editingModal.mode}
          adjustments={editingModal.mode === "comparable" ? analysisState.adjustmentsByPropertyId[modalProperty.id] ?? [] : []}
          onClose={() => setEditingModal(null)}
          onSave={(draft) => {
            onPropertyChange(modalProperty.id, draft.propertyData);
            if (editingModal.mode === "comparable") {
              onAnalysisStateChange(commitComparableEditingDraft(analysisState, modalProperty.id, draft));
            }
            setEditingModal(null);
          }}
        />
      )}

      {isManualPropertyModalOpen && onAddManualProperty && (
        <ManualPropertyModal
          hasExistingSubject={Boolean(subject)}
          onClose={() => setIsManualPropertyModalOpen(false)}
          onCreate={(data, role) => {
            onAddManualProperty(data, role);
            setIsManualPropertyModalOpen(false);
          }}
          allowJlrImport={Boolean(onAddJlrComparable)}
          onAddJlrComparable={(property) => {
            onAddJlrComparable?.(property);
            setIsManualPropertyModalOpen(false);
          }}
        />
      )}
    </section>
  );
}
