"use client";

import { useEffect, useRef, useState } from "react";
import type { OaciqTransactionPreview } from "../lib/transactions/oaciq-agenda";
import { CONFIDENCE_LABELS, MANUAL_DEADLINE_SOURCE, MAX_AGENDA_DEADLINES, OACIQ_UPLOAD_LIMITS, proposalsFromAnalysis, validateOaciqFiles, type DeadlineProposal } from "../lib/transactions/oaciq-agenda";

export function OaciqTransactionImport({ proposals, onChange, disabled, onBusyChange, onApplyBasic, onAnalyzed }: {
  proposals: DeadlineProposal[]; onChange: (items: DeadlineProposal[]) => void;
  disabled: boolean; onBusyChange: (busy: boolean) => void;
  onApplyBasic: (analysis: OaciqTransactionPreview) => void;
  onAnalyzed: (analysis: OaciqTransactionPreview) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<OaciqTransactionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  function setDocuments(next: File[]) {
    if (disabled || busy) return;
    const invalid = next.length ? validateOaciqFiles(next) : null;
    if (invalid) { setError(invalid); return; }
    setFiles(next); setAnalysis(null); setError(null);
    onChange(proposals.filter((p) => p.source.type === "manual"));
  }
  function addFiles(next: File[]) {
    const all = [...files];
    for (const file of next) if (!all.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) all.push(file);
    setDocuments(all);
  }
  function edit(id: string, patch: Partial<DeadlineProposal>) { onChange(proposals.map((p) => p.id === id ? { ...p, ...patch } : p)); }
  async function analyze() {
    if (disabled || request.current || !files.length) return;
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => controller.abort(), OACIQ_UPLOAD_LIMITS.timeoutMs);
    setBusy(true); onBusyChange(true); setError(null);
    try {
      const form = new FormData(); files.forEach((file) => form.append("files", file));
      const response = await fetch("/api/oaciq/analyze", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json().catch(() => null) as { data?: OaciqTransactionPreview; error?: string } | null;
      if (!response.ok || !result?.data) throw new Error(result?.error ?? "Analyse impossible. Réessayez avec des PDF de moins de 4 Mo au total.");
      if (controller.signal.aborted) return;
      setAnalysis(result.data);
      // Only the explicit analysis action applies a detected price. No effect
      // watches the result, so later manual edits cannot be overwritten.
      onAnalyzed(result.data);
      onChange([...proposals.filter((p) => p.source.type === "manual"), ...proposalsFromAnalysis(result.data)]);
    } catch (caught) {
      setError(controller.signal.aborted ? "L’analyse a dépassé le délai prévu. Réessayez ou saisissez les échéances manuellement." : caught instanceof Error ? caught.message : "Analyse impossible.");
    } finally { clearTimeout(timer); request.current = null; setBusy(false); onBusyChange(false); }
  }
  return <section className="oaciq-import transaction-field-wide" aria-labelledby="oaciq-import-title" aria-busy={busy}>
    <header><p className="section-kicker">Documents du dossier · Facultatif</p><h3 id="oaciq-import-title">GLISSER LES DOCUMENTS OACIQ</h3><p>Une PA et ses annexes, analysées ensemble. Révisez les dates avant de créer la transaction.</p></header>
    <div className="oaciq-dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files)); }}>
      <input aria-label="Documents OACIQ PDF" type="file" multiple accept="application/pdf,.pdf" disabled={disabled || busy} onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <p>Déposez vos PDF ici ou choisissez des fichiers · 20 PDF, 4 Mo au total.</p>
    </div>
    {files.length > 0 && <ul className="oaciq-files">{files.map((file, i) => <li key={`${file.name}-${i}`}><span>{file.name}</span><button type="button" disabled={disabled || busy} aria-label={`Retirer ${file.name}`} onClick={() => setDocuments(files.filter((_, index) => index !== i))}>Retirer</button></li>)}</ul>}
    <button className="transaction-add-deadline" type="button" disabled={!files.length || disabled || busy} onClick={() => void analyze()}>{busy ? "ANALYSE DES DOCUMENTS…" : "ANALYSER LES DOCUMENTS"}</button>
    {error && <p className="transaction-form-error" role="alert">{error}</p>}
    {files.length > 0 && !analysis && !busy && <p className="oaciq-notice">Aucune échéance de ces documents ne sera enregistrée sans analyse et révision.</p>}
    {analysis && <div className="oaciq-analysis-summary"><h4>FORMULAIRES DÉTECTÉS</h4><ul>{analysis.forms.map((f, i) => <li key={i}>{f.document} · {f.number || (f.kind === "unknown" ? "Formulaire à vérifier" : f.kind)}</li>)}</ul>
      <dl className="oaciq-basic"><div><dt>Adresse proposée</dt><dd>{analysis.basic?.propertyAddress.fullAddress || analysis.propertyAddress || "Non détectée"}</dd></div><div><dt>Acheteurs</dt><dd>{(analysis.basic?.buyers.length ? analysis.basic.buyers : analysis.buyerNames).join(" · ") || "Non détectés"}</dd></div><div><dt>Vendeurs</dt><dd>{(analysis.basic?.sellers.length ? analysis.basic.sellers : analysis.sellerNames).join(" · ") || "Non détectés"}</dd></div><div><dt>PRIX FINAL</dt><dd>{analysis.finalPrice == null ? "À confirmer" : new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(analysis.finalPrice)}{analysis.priceSourceDocument && <small> · {analysis.priceSourceForm} · {analysis.priceSourceSection} · {analysis.priceSourceDocument}</small>}</dd></div></dl>
      <button type="button" disabled={disabled || busy} onClick={() => onApplyBasic(analysis)}>Compléter les champs vides depuis la PA</button><p className="oaciq-notice">Aucun contact créé ou lié automatiquement. Vérifiez les parties et le prix final, notamment en présence d’une contre-proposition. Une heure conventionnelle du lecteur sans mention explicite dans la clause reste vide.</p>
      {analysis.warnings.length > 0 && <div className="oaciq-warnings" role="status"><strong>À VÉRIFIER</strong><ul>{analysis.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
    </div>}
    <div className="oaciq-review-heading"><h3>ÉCHÉANCES DÉTECTÉES</h3><span>{proposals.filter((p) => p.selected).length} sélectionnée(s)</span></div>
    <p className="oaciq-notice">Agenda interne uniquement. Aucun événement Google Agenda ne sera créé automatiquement.</p>
    <fieldset className="oaciq-proposals" disabled={disabled || busy}>
      {proposals.map((p, index) => <article className="oaciq-proposal" key={p.id}>
        <label className="oaciq-select"><input type="checkbox" checked={p.selected} onChange={(e) => edit(p.id, { selected: e.target.checked })} /><span>AJOUTER À LA TRANSACTION</span></label>
        <div className="oaciq-fields">
          <label className="transaction-field"><span>Titre</span><input aria-label={`Titre échéance ${index + 1}`} value={p.title} maxLength={300} onChange={(e) => edit(p.id, { title: e.target.value })} /></label>
          <label className="transaction-field"><span>Date</span><input aria-label={`Date échéance ${index + 1}`} type="date" value={p.dueDate} onChange={(e) => edit(p.id, { dueDate: e.target.value })} /></label>
          <label className="transaction-field"><span>Heure · Facultative</span><input aria-label={`Heure échéance ${index + 1}`} type="time" value={p.dueTime ?? ""} onChange={(e) => edit(p.id, { dueTime: e.target.value || null })} /></label>
        </div>
        {!p.dueDate && p.dateText && <p className="oaciq-notice">{p.dateText} · Date à préciser avant sélection.</p>}
        <div className="oaciq-source"><span>{p.source.type === "manual" ? "Ajout manuel" : `Source : ${[p.source.form, p.source.section && `clause ${p.source.section}`, p.source.document].filter(Boolean).join(" · ")}`}</span>{p.source.confidence && <span>Confiance : {CONFIDENCE_LABELS[p.source.confidence]}</span>}</div>
        {p.source.text && <details><summary>Voir la source</summary><p className="oaciq-source-text">{p.source.text}</p></details>}
        <button type="button" className="destructive-button" aria-label={`Retirer l’échéance ${index + 1}`} onClick={() => onChange(proposals.filter((item) => item.id !== p.id))}>Retirer la proposition</button>
      </article>)}
    </fieldset>
    {!proposals.length && <p className="oaciq-notice">Aucune proposition pour le moment. Vous pouvez aussi ajouter une échéance manuellement.</p>}
    <button className="transaction-add-deadline" type="button" disabled={disabled || busy || proposals.length >= MAX_AGENDA_DEADLINES} onClick={() => onChange([...proposals, { id: crypto.randomUUID(), title: "", dueDate: "", dueTime: null, selected: true, source: { ...MANUAL_DEADLINE_SOURCE } }])}>+ AJOUTER UNE ÉCHÉANCE</button>
  </section>;
}
