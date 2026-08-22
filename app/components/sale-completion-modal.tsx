"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import type { TransactionSaleCompletion } from "../data/transaction-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type SaleCompletionModalProps = {
  address: string;
  referencePrice: number | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (values: TransactionSaleCompletion) => Promise<void>;
};

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function acquireSaleSubmissionLock(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

function releaseSaleSubmissionLock(lock: { current: boolean }) {
  lock.current = false;
}

function formatTransactionAmount(amount: number) {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SaleCompletionModal({
  address,
  referencePrice,
  isSaving,
  onClose,
  onConfirm,
}: SaleCompletionModalProps) {
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
    if (busy || !acquireSaleSubmissionLock(submittingRef)) return;
    setError(null);
    const parsedPrice = Number(soldPrice);
    if (!soldPrice.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError("Prix vendu invalide.");
      releaseSaleSubmissionLock(submittingRef);
      return;
    }
    if (!validCalendarDate(notaryDate)) {
      setError("Date du notaire requise.");
      releaseSaleSubmissionLock(submittingRef);
      return;
    }
    if (!noCollaboratingBroker && !collaboratingBrokerName.trim()) {
      setError("Indiquez le courtier collaborateur ou choisissez Aucun.");
      releaseSaleSubmissionLock(submittingRef);
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
      releaseSaleSubmissionLock(submittingRef);
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
        aria-labelledby="sale-completion-title"
        aria-modal="true"
        className="listing-sold-modal"
        role="dialog"
      >
        <header className="listing-sold-heading">
          <div>
            <p className="section-kicker">Résultat final</p>
            <h2 id="sale-completion-title">FINALISER LA VENTE</h2>
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
            {referencePrice !== null && <small>Prix de la Transaction : {formatTransactionAmount(referencePrice)}</small>}
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
