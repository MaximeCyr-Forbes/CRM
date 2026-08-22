"use client";

import { useCallback, useRef, useState } from "react";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type Props = {
  address: string;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function TransactionReturnToMarketModal({
  address,
  isSaving,
  onClose,
  onConfirm,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const busy = isSaving || isSubmitting;
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useDialogLifecycle(true, closeIfIdle);

  async function confirm() {
    if (busy || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    let succeeded = false;
    try {
      await onConfirm();
      succeeded = true;
    } catch (caughtError) {
      setError(caughtError instanceof Error
        ? caughtError.message
        : "Impossible de remettre le Listing sur le marché.");
    } finally {
      submittingRef.current = false;
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
        aria-labelledby="return-to-market-title"
        aria-modal="true"
        className="listing-sold-modal transaction-return-market-modal"
        role="dialog"
      >
        <header className="listing-sold-heading">
          <div>
            <p className="section-kicker">Transaction liée à un Listing</p>
            <h2 id="return-to-market-title">RETOUR SUR LE MARCHÉ ?</h2>
            <p>{address}</p>
          </div>
          <button aria-label="Fermer" disabled={busy} onClick={closeIfIdle} type="button">×</button>
        </header>
        <div className="transaction-return-market-content">
          <p>La Transaction sera annulée et conservée dans l’historique.<br />Le Listing sera remis en marché avec le statut Actif.</p>
          {error && <p className="listing-editor-error" role="alert">{error}</p>}
          <footer className="listing-sold-actions">
            <button disabled={busy} onClick={closeIfIdle} type="button">ANNULER</button>
            <button
              aria-busy={busy}
              className="transaction-return-market-confirm"
              disabled={busy}
              onClick={() => void confirm()}
              type="button"
            >
              {busy ? "RETOUR EN COURS…" : "CONFIRMER LE RETOUR"}
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
