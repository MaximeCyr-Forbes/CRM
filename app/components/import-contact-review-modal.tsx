"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CONTACT_DRAFT_FIELDS,
  getContactFullAddress,
  getContactName,
  type Contact,
  type ContactDraft,
} from "../data/contact-types";
import type {
  CSVColumnMatch,
  CSVImportMapping,
  ImportCandidate,
} from "../lib/contact-import";
import { normalizeContactDraft } from "../lib/contact-import";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

const fieldLabels: Record<keyof ContactDraft, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  phone: "Téléphone",
  email: "Email",
  civicNumber: "Numéro civique",
  address: "Rue",
  apartment: "Appartement / unité",
  city: "Ville",
  province: "Province",
  postalCode: "Code postal",
  country: "Pays",
};

const statusLabels: Record<ImportCandidate["status"], string> = {
  new: "Nouveau",
  duplicate: "Doublon possible",
  incomplete: "Incomplet",
};

function fieldMapping(mapping: CSVImportMapping | null, field: keyof ContactDraft): CSVColumnMatch | null {
  if (!mapping) return null;
  if (field === "firstName" || field === "lastName") return mapping[field] ?? mapping.fullName;
  return mapping[field];
}

export function ImportContactReviewModal({
  candidate,
  existing,
  mapping,
  position,
  source,
  total,
  onClose,
  onNext,
  onPrevious,
  onSave,
}: {
  candidate: ImportCandidate;
  existing: Contact | null;
  mapping: CSVImportMapping | null;
  position: number;
  source: "csv" | "vcard";
  total: number;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSave: (draft: ContactDraft) => void;
}) {
  const [values, setValues] = useState<ContactDraft>(candidate.draft);
  const [editedFields, setEditedFields] = useState<ReadonlySet<keyof ContactDraft>>(new Set());
  const [saved, setSaved] = useState(false);
  useDialogLifecycle(true, onClose);

  useEffect(() => {
    setValues(candidate.draft);
    setEditedFields(new Set());
    setSaved(false);
  }, [candidate.id]);

  const existingRows = useMemo(() => existing ? [
    ["Téléphone", existing.phone],
    ["Email", existing.email],
    ["Adresse", getContactFullAddress(existing)],
  ] : [], [existing]);

  function updateField(field: keyof ContactDraft, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setEditedFields((current) => new Set(current).add(field));
    setSaved(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(normalizeContactDraft(values));
    setSaved(true);
  }

  return (
    <div className="contact-modal-backdrop contact-modal-top import-contact-review-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-modal="true" className="contact-modal import-contact-review-modal" role="dialog">
        <header className="contact-modal-header import-contact-review-header">
          <div>
            <p className="section-kicker">Vérification avant import · {position + 1} / {total}</p>
            <h2>{getContactName(candidate.draft)}</h2>
            <div className="import-review-metadata">
              <span>Source · {source.toUpperCase()}</span>
              <span>Statut · {statusLabels[candidate.status]}</span>
              {mapping && <span>{mapping.hasHeader ? "Headers reconnus" : "Structure inférée"}</span>}
            </div>
          </div>
          <button aria-label="Fermer" onClick={onClose} type="button">×</button>
        </header>

        <nav className="import-contact-review-navigation" aria-label="Navigation entre les contacts importés">
          <button disabled={!onPrevious} onClick={onPrevious} type="button">← Contact précédent</button>
          <button disabled={!onNext} onClick={onNext} type="button">Contact suivant →</button>
        </nav>

        {existing && <section className="import-existing-contact">
          <p>INFORMATION EXISTANTE</p>
          <h3>{getContactName(existing)}</h3>
          <dl>{existingRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Non renseigné"}</dd></div>)}</dl>
        </section>}

        <form className="import-contact-review-form" onSubmit={submit}>
          <div className="import-contact-review-section-heading"><div><p>INFORMATION IMPORTÉE</p><strong>Corrigez uniquement si nécessaire.</strong></div>{saved && <span>Corrections enregistrées ✓</span>}</div>
          <div className="import-contact-review-fields">
            {CONTACT_DRAFT_FIELDS.map((field) => {
              const detected = fieldMapping(mapping, field);
              const hasValue = values[field].trim().length > 0;
              const confidence = detected?.confidence ?? (source === "vcard" && hasValue ? 0.95 : 0);
              const wasEdited = editedFields.has(field);
              return <label className={field === "address" ? "import-review-field-wide" : ""} key={field}>
                <span>{fieldLabels[field]} <small className={wasEdited || confidence >= 0.72 ? "field-confidence-high" : "field-confidence-low"}>{wasEdited ? "Corrigé ✓" : !hasValue ? "Non détecté" : confidence >= 0.72 ? `✓ ${Math.round(confidence * 100)} %` : "⚠ Vérifier"}</small></span>
                <input onChange={(event) => updateField(field, event.target.value)} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} value={values[field]} />
                {detected && <small className="import-field-source">{detected.label}</small>}
              </label>;
            })}
          </div>
          <div className="import-contact-review-actions">
            <button onClick={onClose} type="button">FERMER</button>
            <button type="submit">ENREGISTRER LES CORRECTIONS</button>
          </div>
        </form>
      </section>
    </div>
  );
}
