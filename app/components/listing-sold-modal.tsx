"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import type { ListingSaleCompletion } from "../data/listing-types";
import {
  acquireListingSubmissionLock,
  releaseListingSubmissionLock,
} from "../lib/listings/editor";
import { formatListingAmount } from "../lib/listings/presentation";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type ListingSoldModalProps = {
  address: string;
  askingPrice: number | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (values: ListingSaleCompletion) => Promise<void>;
};

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function ListingSoldModal({
  address,
  askingPrice,
  isSaving,
  onClose,
  onConfirm,
}: ListingSoldModalProps) {
  const [soldPrice, setSoldPrice] = useState("");
  const [notaryDate, setNotaryDate] = useState("");
  const [collaboratingBrokerName, setCollaboratingBrokerName] = useState("");
  const [noCollaboratingBroker, setNoCollaboratingBroker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const busy = isSaving || isSubmitting;
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useDialogLifecycle(true, closeIfIdle);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !acquireListingSubmissionLock(submittingRef)) return;
    setError(null);
    const parsedPrice = Number(soldPrice);
    if (!soldPrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Prix vendu invalide.");
      releaseListingSubmissionLock(submittingRef);
      return;
    }
    if (!validCalendarDate(notaryDate)) {
      setError("Date du notaire requise.");
      releaseListingSubmissionLock(submittingRef);
      return;
    }
    if (!noCollaboratingBroker && !collaboratingBrokerName.trim()) {
      setError("Indiquez le courtier collaborateur ou choisissez Aucun.");
      releaseListingSubmissionLock(submittingRef);
      return;
    }

    setIsSubmitting(true);
    let succeeded = false;
    try {
      await onConfirm({
        soldPrice: parsedPrice,
        notaryDate,
        collaboratingBrokerName: noCollaboratingBroker ? "" : collaboratingBrokerName.trim(),
        noCollaboratingBroker,
      });
      succeeded = true;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Impossible d’enregistrer la vente.");
    } finally {
      releaseListingSubmissionLock(submittingRef);
      setIsSubmitting(false);
    }
    if (succeeded) onClose();
  }

  return (
    <div
      className="listing-editor-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && closeIfIdle()}
      role="presentation"
    >
      <section
        aria-labelledby="listing-sold-title"
        aria-modal="true"
        className="listing-sold-modal"
        role="dialog"
      >
        <header className="listing-sold-heading">
          <div>
            <p className="section-kicker">Résultat final</p>
            <h2 id="listing-sold-title">MARQUER LE LISTING COMME VENDU</h2>
            <p>{address}</p>
          </div>
          <button aria-label="Fermer" disabled={busy} onClick={closeIfIdle} type="button">×</button>
        </header>

        <form className="listing-sold-form" noValidate onSubmit={submit}>
          <label>
            <span>Prix vendu *</span>
            <span className="listing-money-field">
              <input
                autoFocus
                min="0"
                onChange={(event) => setSoldPrice(event.target.value)}
                required
                step="0.01"
                type="number"
                value={soldPrice}
              />
              <strong>$</strong>
            </span>
            {askingPrice !== null && <small>Prix demandé : {formatListingAmount(askingPrice, "sale")}</small>}
          </label>

          <label>
            <span>Date du notaire *</span>
            <input onChange={(event) => setNotaryDate(event.target.value)} required type="date" value={notaryDate} />
          </label>

          <label>
            <span>Courtier collaborateur *</span>
            <input
              disabled={noCollaboratingBroker}
              maxLength={240}
              onChange={(event) => setCollaboratingBrokerName(event.target.value)}
              placeholder="Nom du courtier collaborateur"
              required={!noCollaboratingBroker}
              type="text"
              value={collaboratingBrokerName}
            />
          </label>

          <label className="listing-sold-none">
            <input
              checked={noCollaboratingBroker}
              onChange={(event) => setNoCollaboratingBroker(event.target.checked)}
              type="checkbox"
            />
            <span>Aucun courtier collaborateur</span>
          </label>

          {error && <p className="listing-editor-error" role="alert">{error}</p>}

          <footer className="listing-sold-actions">
            <button disabled={busy} onClick={closeIfIdle} type="button">Annuler</button>
            <button aria-busy={busy} className="listing-sold-confirm" disabled={busy} type="submit">
              {busy ? "Enregistrement…" : "Confirmer la vente"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
