"use client";

import { useState } from "react";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

export function ListingDeleteConfirmationModal({
  address,
  isSaving,
  onClose,
  onConfirm,
}: {
  address: string;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  async function confirm() {
    setError(null);
    try {
      await onConfirm();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Suppression du Listing impossible.");
    }
  }

  return (
    <div className="listing-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="listing-delete-title" aria-modal="true" className="listing-delete-modal" role="dialog">
        <header className="listing-editor-heading">
          <div>
            <p className="section-kicker">Action irréversible</p>
            <h2 id="listing-delete-title">SUPPRIMER CE LISTING ?</h2>
          </div>
          <button aria-label="Fermer" disabled={isSaving} onClick={onClose} type="button">×</button>
        </header>
        <div className="listing-delete-content">
          <strong>{address}</strong>
          <p>Cette action supprimera le Listing du CRM. Les propriétaires liés resteront dans Contacts.</p>
          {error && <p className="listing-editor-error" role="alert">{error}</p>}
        </div>
        <footer className="listing-delete-actions">
          <button disabled={isSaving} onClick={onClose} type="button">Annuler</button>
          <button className="destructive-button" disabled={isSaving} onClick={() => void confirm()} type="button">
            {isSaving ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </footer>
      </section>
    </div>
  );
}
