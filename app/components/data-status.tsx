"use client";

import { useCRMData } from "../crm-data-context";

export function DataStatus() {
  const { isLoading, isSaving, error, retry } = useCRMData();

  if (!isLoading && !isSaving && !error) {
    return null;
  }

  return (
    <div className={`data-status ${error ? "data-status-error" : ""}`} role="status">
      <span>
        {error ?? (isLoading ? "Chargement des contacts..." : "Enregistrement...")}
      </span>
      {error && (
        <button onClick={() => void retry()} type="button">
          Réessayer
        </button>
      )}
    </div>
  );
}
