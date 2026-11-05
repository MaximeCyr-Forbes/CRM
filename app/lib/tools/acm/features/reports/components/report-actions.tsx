"use client";

import { useState } from "react";
import { Check, Download, Eye, LoaderCircle, X } from "lucide-react";
import type { CmaReportData } from "@/app/lib/tools/acm/types";

interface ReportActionsProps {
  report: CmaReportData;
}

type GenerationStatus = "idle" | "preparing" | "ready" | "error";

export function ReportActions({ report }: ReportActionsProps) {
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("brochure-acm.pdf");

  async function requestReport(disposition: "inline" | "attachment") {
    setStatus("preparing");
    setMessage("Préparation de votre analyse... Génération du document...");
    try {
      const response = await fetch(`/api/tools/acm/reports/generate?disposition=${disposition}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ report, template: "classic" }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "La brochure n’a pas pu être générée.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const nextFileName = response.headers.get("X-Report-Filename") ?? "brochure-acm.pdf";
      const warningHeader = response.headers.get("X-Report-Warnings");
      const warnings = warningHeader
        ? JSON.parse(decodeURIComponent(warningHeader)) as string[]
        : [];
      setFileName(nextFileName);
      if (disposition === "inline") {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(objectUrl);
      } else {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
        setDownloadUrl(objectUrl);
      }
      setStatus("ready");
      setMessage(warnings.length > 0 ? `Brochure prête. ${warnings.join(" ")}` : "Brochure prête.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "La brochure n’a pas pu être générée.");
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  return (
    <section className="report-actions" aria-labelledby="report-actions-title">
      <div className="report-actions__copy">
        <span className="property-results__eyebrow">Document client</span>
        <h3 id="report-actions-title">Brochure ACM</h3>
        <p>Prévisualisez l’analyse, puis générez une copie temporaire prête à remettre au propriétaire.</p>
      </div>
      <div className="report-actions__controls">
        <button className="secondary-button" type="button" disabled={status === "preparing"} onClick={() => requestReport("inline")}><Eye size={15} /> Prévisualiser la brochure</button>
        <button className="primary-button primary-button--compact" type="button" disabled={status === "preparing"} onClick={() => requestReport("attachment")}>
          {status === "preparing" ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
          Générer le PDF
        </button>
        {downloadUrl && <a className="report-download" href={downloadUrl} download={fileName}><Download size={15} /> Télécharger la brochure</a>}
      </div>
      {message && (
        <div className={`report-actions__status report-actions__status--${status}`} role="status">
          {status === "preparing" ? <LoaderCircle className="spin" size={15} /> : status === "ready" ? <Check size={15} /> : null}
          {message}
        </div>
      )}

      {previewUrl && (
        <div className="report-preview" role="dialog" aria-modal="true" aria-labelledby="report-preview-title">
          <div className="report-preview__header">
            <div><span>Aperçu PDF</span><strong id="report-preview-title">{fileName}</strong></div>
            <button type="button" onClick={closePreview} aria-label="Fermer la prévisualisation"><X size={18} /></button>
          </div>
          <iframe src={previewUrl} title="Prévisualisation de la brochure ACM" />
        </div>
      )}
    </section>
  );
}
