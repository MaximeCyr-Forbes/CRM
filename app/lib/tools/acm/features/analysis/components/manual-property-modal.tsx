"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, FileText, LoaderCircle, Plus, Upload, X } from "lucide-react";
import type { DragEvent } from "react";
import type { ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import type { ManualPropertyRole } from "../manual-property";
import { parsePropertyFiles } from "@/app/lib/tools/acm/features/property-import/parse-property-files";
import { withCorrectedPropertyData } from "@/app/lib/tools/acm/features/property-import/imported-properties";
import { PropertyEditor } from "./property-editor";

interface ManualPropertyModalProps {
  hasExistingSubject: boolean;
  onCreate: (data: PropertyData, role: ManualPropertyRole) => void;
  onClose: () => void;
  allowJlrImport?: boolean;
  onAddJlrComparable?: (property: ParsedProperty) => void;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function ManualPropertyModal({ hasExistingSubject, onCreate, onClose, allowJlrImport = false, onAddJlrComparable }: ManualPropertyModalProps) {
  const [mode, setMode] = useState<"manual" | "jlr">("manual");
  const [draft, setDraft] = useState<PropertyData>({});
  const [jlrProperty, setJlrProperty] = useState<ParsedProperty>();
  const [isParsingJlr, setIsParsingJlr] = useState(false);
  const [isDraggingJlr, setIsDraggingJlr] = useState(false);
  const [jlrError, setJlrError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const jlrInputRef = useRef<HTMLInputElement>(null);

  async function importJlr(file?: File) {
    if (!file || isParsingJlr) return;
    setIsParsingJlr(true);
    setJlrError("");
    setJlrProperty(undefined);
    const result = await parsePropertyFiles([file]);
    const parsed = result.properties[0];
    if (!parsed || parsed.documentType !== "jlr") {
      setJlrError("Ce document ne semble pas être un feuillet JLR.");
      setIsParsingJlr(false);
      return;
    }
    setJlrProperty(parsed);
    setDraft(structuredClone(parsed.data));
    setIsParsingJlr(false);
  }

  function handleJlrDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingJlr(false);
    void importJlr(event.dataTransfer.files[0]);
  }

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

  return (
    <div className="property-editing-modal__overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div ref={dialogRef} className="property-editing-modal manual-property-modal" role="dialog" aria-modal="true" aria-labelledby="manual-property-modal-title">
        <header className="property-editing-modal__header">
          <div>
            <span className="property-results__eyebrow">{allowJlrImport ? "Ajouter un comparable" : "Création sans fiche Centris"}</span>
            <h2 id="manual-property-modal-title">{allowJlrImport ? "Nouvelle propriété comparable" : "Ajouter une propriété manuellement"}</h2>
            <div className="property-editing-modal__meta">
              <span>{allowJlrImport ? "Saisie manuelle ou feuillet JLR" : "Aucun PDF requis"}</span>
              <span>Champs non obligatoires</span>
            </div>
          </div>
          <button ref={closeButtonRef} className="property-editing-modal__close" type="button" onClick={onClose} aria-label="Fermer sans ajouter la propriété"><X size={19} /></button>
        </header>

        <div className="property-editing-modal__body">
          {allowJlrImport && (
            <div className="manual-property-modal__tabs" role="tablist" aria-label="Méthode d’ajout">
              <button type="button" role="tab" aria-selected={mode === "manual"} className={mode === "manual" ? "is-active" : ""} onClick={() => {
                setMode("manual");
                setDraft({});
                setJlrError("");
              }}>Saisie manuelle</button>
              <button type="button" role="tab" aria-selected={mode === "jlr"} className={mode === "jlr" ? "is-active" : ""} onClick={() => {
                setMode("jlr");
                setDraft(jlrProperty ? structuredClone(jlrProperty.data) : {});
              }}>Importer un feuillet JLR</button>
            </div>
          )}

          {mode === "jlr" && !jlrProperty && (
            <section className="property-editing-modal__section" aria-labelledby="jlr-import-title">
              <div className="property-editing-modal__section-heading">
                <div><span>01</span><h3 id="jlr-import-title">Feuillet JLR</h3></div>
                <p>Le type du document est vérifié à partir de son contenu.</p>
              </div>
              <div
                className={`jlr-import-zone${isDraggingJlr ? " jlr-import-zone--active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => jlrInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") jlrInputRef.current?.click();
                }}
                onDragEnter={(event) => { event.preventDefault(); setIsDraggingJlr(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDraggingJlr(false)}
                onDrop={handleJlrDrop}
              >
                <input ref={jlrInputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => {
                  void importJlr(event.target.files?.[0]);
                  event.target.value = "";
                }} />
                {isParsingJlr ? <LoaderCircle className="spin" size={25} /> : <Upload size={25} />}
                <strong>{isParsingJlr ? "Lecture du feuillet…" : "Déposez un feuillet JLR"}</strong>
                <span>ou choisissez un fichier PDF</span>
              </div>
              {jlrError && <p className="jlr-import-error" role="alert">{jlrError}</p>}
            </section>
          )}

          {mode === "jlr" && jlrProperty && (
            <div className="jlr-import-summary" role="status">
              <FileText size={17} />
              <span><strong>Feuillet JLR reconnu</strong>{jlrProperty.sourceFile}</span>
              <button type="button" onClick={() => { setJlrProperty(undefined); setDraft({}); }}>Remplacer</button>
            </div>
          )}

          {(mode === "manual" || jlrProperty) && (
          <section className="property-editing-modal__section" aria-labelledby="manual-property-information-title">
            <div className="property-editing-modal__section-heading">
              <div>
                <span>{mode === "jlr" ? "02" : "01"}</span>
                <h3 id="manual-property-information-title">{mode === "jlr" ? "Vérifier les données extraites" : "Informations de la propriété"}</h3>
              </div>
              <p>Le formulaire s’adapte automatiquement à la catégorie choisie.</p>
            </div>
            <PropertyEditor idPrefix="manual-property" value={draft} variant="manual" onChange={setDraft} />
          </section>
          )}
        </div>

        <footer className="property-editing-modal__footer manual-property-modal__footer">
          <span>{mode === "jlr" ? "Corrigez les données avant d’ajouter le comparable." : "La propriété restera entièrement modifiable."}</span>
          <div>
            <button className="secondary-button" type="button" onClick={onClose}><X size={15} /> Annuler</button>
            {mode === "jlr" ? (
              <button
                className="primary-button primary-button--compact"
                type="button"
                disabled={!jlrProperty || !onAddJlrComparable}
                onClick={() => jlrProperty && onAddJlrComparable?.(withCorrectedPropertyData(jlrProperty, draft))}
              >
                <Plus size={15} /> Ajouter comme comparable
              </button>
            ) : (
              <>
            <button
              className="secondary-button"
              type="button"
              disabled={!hasExistingSubject}
              title={hasExistingSubject ? undefined : "Ajoutez d’abord une propriété sujet."}
              onClick={() => onCreate(draft, "comparable")}
            >
              <Plus size={15} /> Ajouter comme comparable
            </button>
            <button className="primary-button primary-button--compact" type="button" onClick={() => onCreate(draft, "subject")}>
              <Building2 size={15} /> Ajouter comme propriété sujet
            </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
