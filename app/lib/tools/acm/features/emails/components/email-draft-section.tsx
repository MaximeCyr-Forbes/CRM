"use client";

import { useState } from "react";
import { Check, Copy, Mail, RefreshCw, Sparkles } from "lucide-react";
import type { CmaReportData, EmailDraft } from "../../../types";
import {
  createMailtoUrl,
  formatEmailBodyForClipboard,
  formatEmailForClipboard,
  generateEmailDraft,
  isEmailContentModified,
} from "../index";

interface EmailDraftSectionProps {
  report: CmaReportData;
  draft: EmailDraft;
  onChange: (draft: EmailDraft) => void;
}

type CopyStatus = "all" | "body" | "error" | null;

export function EmailDraftSection({ report, draft, onChange }: EmailDraftSectionProps) {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const [confirmRegeneration, setConfirmRegeneration] = useState(false);
  const hasGeneratedContent = Boolean(draft.generatedAt);
  const mailtoUrl = hasGeneratedContent ? createMailtoUrl(draft) : "";
  const canUseMailto = mailtoUrl.length <= 1_900;

  function updateRecipient(field: "firstName" | "lastName" | "email", value: string) {
    onChange({ ...draft, [field]: value });
    setCopyStatus(null);
  }

  function updateContent(field: "subject" | "body", value: string) {
    const subject = field === "subject" ? value : draft.subject;
    const body = field === "body" ? value : draft.body;
    onChange({
      ...draft,
      [field]: value,
      editedManually: draft.editedManually || isEmailContentModified(draft, subject, body),
    });
    setCopyStatus(null);
  }

  function replaceWithGeneratedDraft() {
    onChange(generateEmailDraft(report, {
      firstName: draft.firstName,
      lastName: draft.lastName,
      email: draft.email,
    }));
    setConfirmRegeneration(false);
    setCopyStatus(null);
  }

  function requestGeneration() {
    if (hasGeneratedContent && draft.editedManually) {
      setConfirmRegeneration(true);
      return;
    }
    replaceWithGeneratedDraft();
  }

  async function copyText(value: string, status: Exclude<CopyStatus, "error" | null>) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(status);
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <section className="email-draft" aria-labelledby="email-draft-title">
      <header className="email-draft__header">
        <div>
          <span className="property-results__eyebrow">Communication client</span>
          <h3 id="email-draft-title">Courriel d’accompagnement</h3>
          <p>Préparez un message modifiable à joindre à la brochure, sans envoi automatique.</p>
        </div>
        <button className="primary-button primary-button--compact" type="button" onClick={requestGeneration}>
          {hasGeneratedContent ? <RefreshCw size={15} /> : <Sparkles size={15} />}
          {hasGeneratedContent ? "Régénérer" : "Générer le courriel"}
        </button>
      </header>

      <div className="email-recipient-grid">
        <label>
          <span>Prénom du client</span>
          <input value={draft.firstName} onChange={(event) => updateRecipient("firstName", event.target.value)} placeholder="Optionnel" />
        </label>
        <label>
          <span>Nom du client</span>
          <input value={draft.lastName} onChange={(event) => updateRecipient("lastName", event.target.value)} placeholder="Optionnel" />
        </label>
        <label>
          <span>Courriel du client</span>
          <input type="email" value={draft.email} onChange={(event) => updateRecipient("email", event.target.value)} placeholder="Optionnel" autoComplete="email" />
        </label>
      </div>

      {confirmRegeneration && (
        <div className="email-regeneration-confirmation" role="alert">
          <div>
            <strong>Remplacer vos modifications?</strong>
            <span>La régénération remplacera l’objet et le corps que vous avez modifiés.</span>
          </div>
          <div>
            <button className="secondary-button" type="button" onClick={() => setConfirmRegeneration(false)}>Conserver mon texte</button>
            <button className="primary-button primary-button--compact" type="button" onClick={replaceWithGeneratedDraft}>Remplacer</button>
          </div>
        </div>
      )}

      {hasGeneratedContent ? (
        <div className="email-editor">
          <label>
            <span>Objet</span>
            <input value={draft.subject} onChange={(event) => updateContent("subject", event.target.value)} />
          </label>
          <label>
            <span>Corps du courriel</span>
            <textarea rows={20} value={draft.body} onChange={(event) => updateContent("body", event.target.value)} />
          </label>
          <div className="email-editor__actions">
            <button className="primary-button primary-button--compact" type="button" onClick={() => copyText(formatEmailForClipboard(draft), "all")}>
              {copyStatus === "all" ? <Check size={15} /> : <Copy size={15} />}
              {copyStatus === "all" ? "Courriel copié" : "Copier le courriel"}
            </button>
            <button className="secondary-button" type="button" onClick={() => copyText(formatEmailBodyForClipboard(draft), "body")}>
              {copyStatus === "body" ? <Check size={15} /> : <Copy size={15} />}
              {copyStatus === "body" ? "Texte copié" : "Copier seulement le texte"}
            </button>
            {canUseMailto && (
              <a className="secondary-button email-mailto" href={mailtoUrl}><Mail size={15} /> Ouvrir dans mon application courriel</a>
            )}
          </div>
          <div className="email-editor__meta" role="status">
            <span>{draft.editedManually ? "Modifié manuellement" : "Modèle standard généré"}</span>
            {copyStatus === "error" && <span className="email-editor__error">La copie a échoué. Sélectionnez le texte manuellement.</span>}
          </div>
          <small className="email-draft__warning">Vérifiez le contenu avant l’envoi.</small>
        </div>
      ) : (
        <div className="email-draft__empty">
          <Mail size={20} />
          <span>Saisissez les coordonnées disponibles, puis générez un modèle à personnaliser.</span>
        </div>
      )}
    </section>
  );
}
