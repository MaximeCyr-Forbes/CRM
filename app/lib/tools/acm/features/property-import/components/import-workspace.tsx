"use client";

import { useRef, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, FileText, LoaderCircle, LockKeyhole, Plus, Trash2, Upload } from "lucide-react";
import type { DragEvent, ChangeEvent, KeyboardEvent } from "react";
import type { ParsePropertiesResponse, ParsedProperty, PropertyData } from "@/app/lib/tools/acm/types";
import { PropertyResults } from "@/app/lib/tools/acm/features/analysis/components/property-results";
import { CmaWorkspace } from "@/app/lib/tools/acm/features/analysis/components/cma-workspace";
import { ManualPropertyModal } from "@/app/lib/tools/acm/features/analysis/components/manual-property-modal";
import { addManualPropertyToAnalysis, type ManualPropertyRole } from "@/app/lib/tools/acm/features/analysis/manual-property";
import type { CmaWorkspaceState } from "@/app/lib/tools/acm/features/comparables";
import { MAX_FILES_PER_ANALYSIS } from "@/app/lib/tools/acm/features/property-parser/constants";
import { validatePdfMetadata } from "@/app/lib/tools/acm/features/property-parser/validation";
import type { ImportedPropertyFile } from "../types";
import { createFileId, formatFileSize } from "../utils/file-utils";
import { parsePropertyFiles } from "../parse-property-files";
import { addImportedComparable, prepareImportedWorkspace } from "../imported-properties";

const STATUS_LABELS: Record<ImportedPropertyFile["status"], string> = {
  selected: "Ajouté",
  analyzing: "Analyse…",
  ready: "Prêt",
  error: "Erreur",
};

export function ImportWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ImportedPropertyFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isPrepared, setIsPrepared] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [properties, setProperties] = useState<ParsedProperty[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [isCmaOpen, setIsCmaOpen] = useState(false);
  const [cmaState, setCmaState] = useState<CmaWorkspaceState | null>(null);
  const [isManualPropertyModalOpen, setIsManualPropertyModalOpen] = useState(false);
  const [suggestedSubjectId, setSuggestedSubjectId] = useState<string>();

  function addFiles(incomingFiles: File[]) {
    const validationMessages: string[] = [];
    const pdfFiles = incomingFiles.filter((file) => {
      const validation = validatePdfMetadata(file);
      if (!validation.valid) validationMessages.push(`${file.name}: ${validation.message}`);
      return validation.valid;
    });

    setFiles((currentFiles) => {
      const currentIds = new Set(currentFiles.map(({ id }) => id));
      const uniqueFiles = pdfFiles
        .map((file) => ({ id: createFileId(file), file, status: "selected" as const }))
        .filter(({ id }) => !currentIds.has(id));
      const availableSlots = Math.max(0, MAX_FILES_PER_ANALYSIS - currentFiles.length);
      if (uniqueFiles.length > availableSlots) {
        validationMessages.push(`Une analyse accepte au maximum ${MAX_FILES_PER_ANALYSIS} PDF.`);
      }
      return [...currentFiles, ...uniqueFiles.slice(0, availableSlots)];
    });
    setMessages(validationMessages);
    setProperties([]);
    setIsPrepared(false);
    setIsCmaOpen(false);
    setCmaState(null);
    setSuggestedSubjectId(undefined);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  function removeFile(id: string) {
    setFiles((currentFiles) => currentFiles.filter((item) => item.id !== id));
    setProperties([]);
    setMessages([]);
    setIsPrepared(false);
    setIsCmaOpen(false);
    setCmaState(null);
    setSuggestedSubjectId(undefined);
  }

  function updateFile(id: string, update: Partial<ImportedPropertyFile>) {
    setFiles((currentFiles) => currentFiles.map((item) => item.id === id ? { ...item, ...update } : item));
  }

  async function prepareAnalysis() {
    if (files.length === 0 || isAnalyzing) return;

    setIsAnalyzing(true);
    setIsPrepared(false);
    setProperties([]);
    setMessages([]);

    const parsedProperties: ParsedProperty[] = [];
    const parseMessages: string[] = [];

    for (const item of files) {
      updateFile(item.id, { status: "analyzing", error: undefined });
      const formData = new FormData();
      formData.append("file", item.file, item.file.name);

      try {
        const response = await fetch("/api/tools/acm/parse-properties", {
          method: "POST",
          body: formData,
          cache: "no-store",
        });
        const payload = await response.json() as ParsePropertiesResponse;

        if (!response.ok || payload.results.length === 0) {
          const message = payload.errors[0]?.message ?? "La fiche n'a pas pu être analysée.";
          updateFile(item.id, { status: "error", error: message });
          parseMessages.push(`${item.file.name}: ${message}`);
          continue;
        }

        parsedProperties.push(...payload.results);
        updateFile(item.id, { status: "ready" });
        setProperties([...parsedProperties]);
      } catch {
        const message = "Le service d'analyse est momentanément indisponible.";
        updateFile(item.id, { status: "error", error: message });
        parseMessages.push(`${item.file.name}: ${message}`);
      }
    }

    setProperties(parsedProperties);
    setMessages(parseMessages);
    setIsPrepared(parsedProperties.length > 0);
    if (parsedProperties.length > 0) {
      const preparation = prepareImportedWorkspace(parsedProperties);
      setCmaState(preparation.workspaceState);
      setSuggestedSubjectId(preparation.suggestedSubjectId);
    } else {
      setCmaState(null);
      setSuggestedSubjectId(undefined);
    }
    setIsCmaOpen(parsedProperties.length > 0);
    setIsAnalyzing(false);
  }

  function updateProperty(id: string, data: PropertyData) {
    setProperties((current) => current.map((property) => property.id === id ? { ...property, data } : property));
  }

  function addManualProperty(data: PropertyData, role: ManualPropertyRole) {
    if (properties.length >= MAX_FILES_PER_ANALYSIS) {
      setMessages([`Une analyse accepte au maximum ${MAX_FILES_PER_ANALYSIS} propriétés.`]);
      return;
    }
    const addition = addManualPropertyToAnalysis(properties, cmaState, data, role);
    setProperties(addition.properties);
    setCmaState(addition.workspaceState);
    setIsPrepared(true);
    setIsCmaOpen(true);
    if (role === "subject") setSuggestedSubjectId(undefined);
  }

  function addJlrComparable(property: ParsedProperty) {
    if (!cmaState || properties.length >= MAX_FILES_PER_ANALYSIS) return;
    const addition = addImportedComparable(properties, cmaState, property);
    setProperties(addition.properties);
    setCmaState(addition.workspaceState);
  }

  async function addComparableFiles(incomingFiles: File[]) {
    const availableSlots = Math.max(0, MAX_FILES_PER_ANALYSIS - properties.length);
    if (availableSlots === 0) return { added: 0, errors: [`Une analyse accepte au maximum ${MAX_FILES_PER_ANALYSIS} propriétés.`] };
    const result = await parsePropertyFiles(incomingFiles.slice(0, availableSlots));
    const existingIds = new Set(properties.map(({ id }) => id));
    const additions = result.properties.filter(({ id }) => !existingIds.has(id));
    if (additions.length > 0) {
      setProperties((current) => [...current, ...additions]);
      setCmaState((current) => current ? {
        ...current,
        selection: {
          ...current.selection,
          comparableIds: [...current.selection.comparableIds, ...additions.map(({ id }) => id)],
        },
      } : current);
    }
    const overflowErrors = incomingFiles.length > availableSlots ? [`Seulement ${availableSlots} fichier(s) pouvaient être ajoutés.`] : [];
    return { added: additions.length, errors: [...result.errors, ...overflowErrors] };
  }

  if (isCmaOpen && properties.length > 0 && cmaState) {
    return (
      <CmaWorkspace
        properties={properties}
        analysisState={cmaState}
        onAnalysisStateChange={setCmaState}
        onPropertyChange={updateProperty}
        onBack={() => setIsCmaOpen(false)}
        onAddPropertyFiles={addComparableFiles}
        onAddManualProperty={addManualProperty}
        onAddJlrComparable={addJlrComparable}
        suggestedSubjectId={suggestedSubjectId}
      />
    );
  }

  return (
    <>
    <section className="workspace-card" id="nouvelle-analyse" aria-labelledby="import-title">
      <div className="workspace-card__header">
        <div className="workspace-card__heading">
          <span className="step-number">01</span>
          <h2 id="import-title">Importer les propriétés</h2>
        </div>
        <span className="workspace-card__header-meta">PDF seulement · sélection multiple · 4 Mo par fichier</span>
      </div>

      <div className="workspace-card__body">
        {messages.length > 0 && (
          <div className="error-banner" role="alert">
            <AlertCircle size={20} aria-hidden="true" />
            <div>{messages.map((message) => <p key={message}>{message}</p>)}</div>
          </div>
        )}

        {isPrepared && (
          <div className="preparation-banner" role="status">
            <CheckCircle2 size={21} strokeWidth={1.8} aria-hidden="true" />
            <div>
              <strong>Préparation terminée</strong>
              {properties.length} {properties.length > 1 ? "propriétés sont prêtes" : "propriété est prête"} pour l’analyse.
            </div>
          </div>
        )}

        <div
          className={`drop-zone${isDragging ? " drop-zone--active" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={handleKeyboard}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
          aria-label="Sélectionner ou déposer des fiches Centris ou JLR au format PDF"
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={handleInputChange}
          />
          <span className="drop-zone__icon" aria-hidden="true">
            <Upload size={23} strokeWidth={1.5} />
          </span>
          <h3>Déposez vos fiches Centris ou JLR</h3>
          <p>Importez la propriété à évaluer ainsi que vos propriétés comparables.</p>
          <span className="drop-zone__action">Choisir des fichiers</span>
          <span className="drop-zone__format">Format accepté · PDF</span>
        </div>

        <div className="manual-property-entry">
          <span>Vous n’avez pas de fiche Centris pour une propriété?</span>
          <button className="secondary-button" type="button" onClick={() => setIsManualPropertyModalOpen(true)}>
            <Plus size={15} /> Ajouter une propriété manuellement
          </button>
        </div>

        {files.length > 0 && (
          <div className="file-list" aria-live="polite">
            <div className="file-list__heading">
              <h3>Fichiers sélectionnés</h3>
              <span>{files.length} {files.length > 1 ? "documents" : "document"}</span>
            </div>
            <ul className="file-list__items">
              {files.map((item) => (
                <li className="file-row" key={item.id}>
                  <span className="file-row__icon" aria-hidden="true">
                    <FileText size={17} strokeWidth={1.6} />
                  </span>
                  <span className="file-row__name" title={item.file.name}>{item.file.name}</span>
                  <span className="file-row__size">{formatFileSize(item.file.size)}</span>
                  <span className={`file-row__status file-row__status--${item.status}`} title={item.error}>
                    <span className="file-row__status-dot" />
                    {STATUS_LABELS[item.status]}
                  </span>
                  <button
                    className="file-row__remove"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeFile(item.id);
                    }}
                    aria-label={`Supprimer ${item.file.name}`}
                  >
                    <Trash2 size={16} strokeWidth={1.6} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="workspace-card__footer">
        <span className="footer-note">
          <LockKeyhole size={14} strokeWidth={1.6} aria-hidden="true" />
          Vos documents demeurent confidentiels.
        </span>
        <button className="primary-button" type="button" disabled={files.length === 0 || isAnalyzing} onClick={prepareAnalysis}>
          {isAnalyzing ? "Lecture en cours…" : "Analyser les fiches"}
          {isAnalyzing ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />}
        </button>
      </div>
    </section>
    <PropertyResults properties={properties} onPropertyChange={updateProperty} onOpenCma={() => setIsCmaOpen(true)} />
    {isManualPropertyModalOpen && (
      <ManualPropertyModal
        hasExistingSubject={Boolean(cmaState?.selection.subjectId)}
        onClose={() => setIsManualPropertyModalOpen(false)}
        onCreate={(data, role) => {
          addManualProperty(data, role);
          setIsManualPropertyModalOpen(false);
        }}
      />
    )}
    </>
  );
}
