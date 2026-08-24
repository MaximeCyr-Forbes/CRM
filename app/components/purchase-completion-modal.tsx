"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import type { TransactionPurchaseCompletion } from "../data/transaction-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type PurchaseCompletionModalProps = {
  address: string;
  referencePrice: number | null;
  referenceNotaryDate: string | null;
  referenceCollaboratingBrokerName: string;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (values: TransactionPurchaseCompletion) => Promise<void>;
};

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function PurchaseCompletionModal({
  address,
  referencePrice,
  referenceNotaryDate,
  referenceCollaboratingBrokerName,
  isSaving,
  onClose,
  onConfirm,
}: PurchaseCompletionModalProps) {
  const [purchasePrice, setPurchasePrice] = useState(referencePrice?.toString() ?? "");
  const [notaryDate, setNotaryDate] = useState(referenceNotaryDate ?? "");
  const [collaboratingBrokerName, setCollaboratingBrokerName] = useState(referenceCollaboratingBrokerName);
  const [noCollaboratingBroker, setNoCollaboratingBroker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const busy = isSaving || isSubmitting;
  const closeIfIdle = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useDialogLifecycle(true, closeIfIdle);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const parsedPrice = Number(purchasePrice);
    if (!purchasePrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Prix d’achat final invalide.");
      submittingRef.current = false;
      return;
    }
    if (!validCalendarDate(notaryDate)) {
      setError("Date du notaire requise.");
      submittingRef.current = false;
      return;
    }
    if (!noCollaboratingBroker && !collaboratingBrokerName.trim()) {
      setError("Indiquez le courtier collaborateur ou choisissez Aucun.");
      submittingRef.current = false;
      return;
    }

    setIsSubmitting(true);
    let succeeded = false;
    try {
      await onConfirm({
        purchasePrice: parsedPrice,
        notaryDate,
        collaboratingBrokerName: noCollaboratingBroker ? "" : collaboratingBrokerName.trim(),
        noCollaboratingBroker,
      });
      succeeded = true;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Impossible de finaliser l’achat.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
    if (succeeded) onClose();
  }

  return (
    <div className="listing-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeIfIdle()} role="presentation">
      <section aria-labelledby="purchase-completion-title" aria-modal="true" className="listing-sold-modal" role="dialog">
        <header className="listing-sold-heading">
          <div>
            <p className="section-kicker">Résultat final</p>
            <h2 id="purchase-completion-title">FINALISER L’ACHAT</h2>
            <p>{address}</p>
          </div>
          <button aria-label="Fermer" disabled={busy} onClick={closeIfIdle} type="button">×</button>
        </header>

        <form className="listing-sold-form" noValidate onSubmit={submit}>
          <label>
            <span>Prix d’achat final *</span>
            <span className="listing-money-field">
              <input autoFocus min="0" onChange={(event) => setPurchasePrice(event.target.value)} required step="0.01" type="number" value={purchasePrice} />
              <strong>$</strong>
            </span>
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
              {busy ? "Finalisation…" : "Finaliser l’achat"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
