"use client";

import { useEffect, useRef, useState } from "react";
import { type Broker, useBroker } from "../broker-context";
import type { CalendarBroker, CalendarConnectionStatus } from "../data/calendar-types";
import {
  type GoogleDriveRoot,
} from "../data/google-drive-types";
import { BROKER_LABELS } from "../data/contact-types";
import { pickGoogleDriveFolder } from "../lib/google-drive/picker-client";

const BROKER_KEYS: Record<Broker, CalendarBroker> = {
  France: "france",
  Maxime: "maxime",
  Sandrine: "sandrine",
};

export function SettingsGoogleDrive({ connections }: { connections: CalendarConnectionStatus[] }) {
  const { selectedBroker } = useBroker();
  const broker = selectedBroker ? BROKER_KEYS[selectedBroker] : null;
  const connection = broker ? connections.find((item) => item.broker === broker) : null;
  const [roots, setRoots] = useState<GoogleDriveRoot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pickerLock = useRef(false);

  useEffect(() => {
    if (!broker) {
      setRoots([]);
      return;
    }
    let current = true;
    setIsLoading(true);
    setError(null);
    void fetch(`/api/google-drive/roots?broker=${broker}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { roots?: GoogleDriveRoot[]; error?: string } | null;
        if (!response.ok || !payload?.roots) throw new Error(payload?.error);
        if (current) setRoots(payload.roots);
      })
      .catch(() => {
        if (current) setError("Les dossiers Google Drive n’ont pas pu être chargés.");
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => { current = false; };
  }, [broker]);

  function authorizeDrive() {
    if (!broker) return;
    window.location.assign(`/api/google-calendar/connect?broker=${broker}&capability=drive&returnTo=/settings`);
  }

  async function saveSelectedFolder(folderId: string) {
    if (!broker || isSaving) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/google-drive/roots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broker, folderId }),
      });
      const payload = await response.json().catch(() => null) as { root?: GoogleDriveRoot; error?: string } | null;
      if (!response.ok || !payload?.root) throw new Error(payload?.error);
      setRoots((current) => [...current.filter((root) => root.id !== payload.root!.id), payload.root!]);
      setMessage(`Dossier « ${payload.root.folderName} » partagé avec le CRM.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error && caughtError.message
        ? caughtError.message
        : "Le dossier Google Drive n’a pas pu être ajouté.");
    } finally {
      setIsSaving(false);
    }
  }

  async function openPicker() {
    if (!broker || pickerLock.current) return;
    pickerLock.current = true;
    setIsOpeningPicker(true);
    setError(null);
    setMessage(null);
    try {
      const folderId = await pickGoogleDriveFolder(broker);
      if (folderId) await saveSelectedFolder(folderId);
    } catch (caughtError) {
      setError(caughtError instanceof Error && caughtError.message
        ? caughtError.message
        : "Google Picker est temporairement indisponible.");
    } finally {
      pickerLock.current = false;
      setIsOpeningPicker(false);
    }
  }

  async function removeRoot(rootId: string) {
    if (!broker || removingId) return;
    setRemovingId(rootId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/google-drive/roots/${rootId}?broker=${broker}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error);
      }
      setRoots((current) => current.filter((root) => root.id !== rootId));
      setPendingRemovalId(null);
      setMessage("Le dossier a été retiré du CRM. Son contenu Google Drive est inchangé.");
    } catch (caughtError) {
      setError(caughtError instanceof Error && caughtError.message
        ? caughtError.message
        : "Le dossier n’a pas pu être retiré du CRM.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section className="settings-drive" aria-labelledby="settings-drive-title">
      <header className="settings-drive-header">
        <div>
          <p className="section-kicker">Accès manuel</p>
          <h2 id="settings-drive-title">DOSSIERS GOOGLE DRIVE</h2>
          <p>Seuls les dossiers choisis ici sont partagés avec le CRM. Aucun fichier n’est modifié.</p>
        </div>
        {broker && connection?.driveEnabled ? (
          <button disabled={isOpeningPicker || isSaving} onClick={() => void openPicker()} type="button">
            {isOpeningPicker || isSaving ? "OUVERTURE…" : "AJOUTER UN DOSSIER DRIVE"}
          </button>
        ) : broker ? (
          <button onClick={authorizeDrive} type="button">AUTORISER GOOGLE DRIVE</button>
        ) : null}
      </header>

      {!broker && <p className="settings-drive-state">Sélectionnez un courtier pour gérer ses dossiers Drive.</p>}
      {broker && (
        <p className="settings-drive-broker">
          Courtier consulté · <strong>{BROKER_LABELS[broker]}</strong>
        </p>
      )}
      {message && <p className="settings-drive-message" role="status">✓ {message}</p>}
      {error && <p className="settings-drive-error" role="alert">{error}</p>}
      {isLoading && <p className="settings-drive-state">Chargement des dossiers partagés...</p>}
      {!isLoading && broker && roots.length === 0 && !error && (
        <p className="settings-drive-state">Aucun dossier Google Drive partagé avec le CRM.</p>
      )}

      <div className="settings-drive-roots">
        {roots.map((root) => (
          <article key={root.id}>
            <div>
              <span aria-hidden="true">▱</span>
              <div>
                <h3>{root.folderName}</h3>
                <p>{root.driveId ? "Drive partagé" : "Mon Drive ou dossier partagé"}</p>
              </div>
            </div>
            <div className="settings-drive-root-actions">
              {root.webViewLink && (
                <a href={root.webViewLink} rel="noreferrer" target="_blank">OUVRIR DANS DRIVE</a>
              )}
              {pendingRemovalId === root.id ? (
                <span className="settings-drive-remove-confirmation">
                  <small>Retirer du CRM seulement?</small>
                  <button disabled={removingId === root.id} onClick={() => void removeRoot(root.id)} type="button">
                    {removingId === root.id ? "RETRAIT…" : "CONFIRMER"}
                  </button>
                  <button disabled={removingId === root.id} onClick={() => setPendingRemovalId(null)} type="button">ANNULER</button>
                </span>
              ) : (
                <button className="settings-drive-remove" onClick={() => setPendingRemovalId(root.id)} type="button">
                  RETIRER DU CRM
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
