"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarBroker } from "../data/calendar-types";
import { BROKER_LABELS } from "../data/contact-types";
import type {
  GoogleDriveEntityLink,
  GoogleDriveEntityType,
  GoogleDriveFolderListing,
  GoogleDriveRoot,
} from "../data/google-drive-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type Props = {
  broker: CalendarBroker | null;
  entityId: string;
  entityType: GoogleDriveEntityType;
};

async function responseJson<T>(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error ?? fallback);
  return payload;
}

function DriveFolderSelector({
  broker,
  entityId,
  entityType,
  onClose,
  onLinked,
}: Props & { onClose(): void; onLinked(link: GoogleDriveEntityLink): void }) {
  const [roots, setRoots] = useState<GoogleDriveRoot[]>([]);
  const [listing, setListing] = useState<GoogleDriveFolderListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);

  useEffect(() => {
    let current = true;
    if (!broker) return;
    void fetch(`/api/google-drive/roots?broker=${broker}`, { cache: "no-store" })
      .then((response) => responseJson<{ roots: GoogleDriveRoot[] }>(response, "Chargement des dossiers Drive impossible."))
      .then((payload) => { if (current) setRoots(payload.roots); })
      .catch((caughtError) => { if (current) setError(caughtError instanceof Error ? caughtError.message : "Chargement impossible."); })
      .finally(() => { if (current) setIsLoading(false); });
    return () => { current = false; };
  }, [broker]);

  async function browse(root: GoogleDriveRoot, folderId?: string) {
    setIsLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ broker: broker!, rootId: root.id });
      if (folderId) search.set("folderId", folderId);
      const payload = await responseJson<{ data: GoogleDriveFolderListing }>(
        await fetch(`/api/google-drive/browse?${search.toString()}`, { cache: "no-store" }),
        "Ce dossier Drive est inaccessible.",
      );
      setListing(payload.data);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ce dossier Drive est inaccessible.");
    } finally {
      setIsLoading(false);
    }
  }

  async function linkCurrentFolder() {
    if (!listing || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = await responseJson<{ link: GoogleDriveEntityLink }>(
        await fetch("/api/google-drive/entity-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId, rootId: listing.root.id, folderId: listing.folder.id }),
        }),
        "Le dossier Drive n’a pas pu être lié.",
      );
      onLinked(payload.link);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Le dossier Drive n’a pas pu être lié.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="drive-link-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="drive-link-modal-title" aria-modal="true" className="drive-link-modal" role="dialog">
        <header>
          <div><p className="section-kicker">Racines autorisées seulement</p><h2 id="drive-link-modal-title">LIER UN DOSSIER DRIVE</h2></div>
          <button aria-label="Fermer" disabled={isSaving} onClick={onClose} type="button">×</button>
        </header>
        {listing ? (
          <>
            <nav aria-label="Fil d’Ariane du sélecteur Drive" className="drive-link-breadcrumbs">
              <button onClick={() => setListing(null)} type="button">RACINES</button>
              {listing.breadcrumbs.map((crumb, index) => (
                <span key={crumb.id}>
                  <i aria-hidden="true">›</i>
                  <button
                    aria-current={index === listing.breadcrumbs.length - 1 ? "page" : undefined}
                    disabled={index === listing.breadcrumbs.length - 1}
                    onClick={() => void browse(listing.root, crumb.id)}
                    type="button"
                  >{crumb.name}</button>
                </span>
              ))}
            </nav>
            <div className="drive-link-current-folder">
              <div><span aria-hidden="true">▱</span><div><small>Dossier sélectionné</small><strong>{listing.folder.name}</strong></div></div>
              <button disabled={isSaving} onClick={() => void linkCurrentFolder()} type="button">{isSaving ? "LIAISON…" : "LIER CE DOSSIER"}</button>
            </div>
            <div className="drive-link-folder-list">
              {listing.items.filter((item) => item.isFolder).map((folder) => (
                <button key={folder.id} onClick={() => void browse(listing.root, folder.id)} type="button">
                  <span aria-hidden="true">▱</span><strong>{folder.name}</strong><i aria-hidden="true">→</i>
                </button>
              ))}
              {!isLoading && listing.items.every((item) => !item.isFolder) && <p>Aucun sous-dossier dans ce dossier.</p>}
            </div>
          </>
        ) : (
          <div className="drive-link-root-list">
            {roots.map((root) => (
              <button key={root.id} onClick={() => void browse(root)} type="button">
                <span aria-hidden="true">▱</span><span><small>{root.driveId ? "DRIVE PARTAGÉ" : "DOSSIER AUTORISÉ"}</small><strong>{root.folderName}</strong></span><i aria-hidden="true">→</i>
              </button>
            ))}
            {!isLoading && roots.length === 0 && !error && <p>Aucun dossier Drive autorisé pour ce courtier.</p>}
          </div>
        )}
        {isLoading && <p className="drive-link-state" role="status">Chargement des dossiers…</p>}
        {error && <p className="drive-link-error" role="alert">{error}</p>}
        <footer><button disabled={isSaving} onClick={onClose} type="button">ANNULER</button></footer>
      </section>
    </div>
  );
}

export function DriveDocumentsSection({ broker, entityId, entityType }: Props) {
  const [links, setLinks] = useState<GoogleDriveEntityLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ entityType, entityId });
      const payload = await responseJson<{ links: GoogleDriveEntityLink[] }>(
        await fetch(`/api/google-drive/entity-links?${search.toString()}`, { cache: "no-store" }),
        "Chargement des documents Drive impossible.",
      );
      setLinks(payload.links);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Chargement des documents Drive impossible.");
    } finally {
      setIsLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => { void loadLinks(); }, [loadLinks]);

  async function removeLink(linkId: string) {
    if (removingId) return;
    setRemovingId(linkId);
    setError(null);
    try {
      await responseJson<{ data: { linkId: string } }>(
        await fetch(`/api/google-drive/entity-links/${linkId}`, { method: "DELETE" }),
        "Le lien Drive n’a pas pu être retiré.",
      );
      setLinks((current) => current.filter((link) => link.id !== linkId));
      setPendingRemovalId(null);
      setMessage("Lien retiré du CRM. Le dossier Google Drive reste intact.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Le lien Drive n’a pas pu être retiré.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <section aria-labelledby={`drive-documents-${entityType}`} className="drive-documents-section">
      <div className="drive-documents-heading">
        <div><p className="section-kicker">Dossiers autorisés</p><h2 id={`drive-documents-${entityType}`}>DOCUMENTS DRIVE</h2></div>
        <button disabled={!broker} onClick={() => { setMessage(null); setIsSelectorOpen(true); }} type="button">LIER UN DOSSIER DRIVE</button>
      </div>
      {!broker && <p className="drive-documents-state">Attribuez d’abord un courtier pour lier un dossier Drive.</p>}
      {broker && <p className="drive-documents-broker">Google Drive de <strong>{BROKER_LABELS[broker]}</strong></p>}
      {message && <p className="drive-documents-message" role="status">✓ {message}</p>}
      {error && <p className="drive-documents-error" role="alert">{error}</p>}
      {isLoading ? <p className="drive-documents-state" role="status">Chargement des documents Drive…</p> : (
        <div className="drive-documents-list">
          {links.map((link) => (
            <article key={link.id}>
              <span aria-hidden="true">▱</span>
              <div><strong>{link.folderName}</strong><small>Dossier Google Drive lié manuellement</small></div>
              <div className="drive-documents-actions">
                {link.webViewLink && <a href={link.webViewLink} rel="noopener noreferrer" target="_blank">OUVRIR ↗</a>}
                {pendingRemovalId === link.id ? (
                  <span className="drive-documents-remove-confirm">
                    <small>Le dossier Google restera intact.</small>
                    <button disabled={removingId === link.id} onClick={() => void removeLink(link.id)} type="button">CONFIRMER</button>
                    <button disabled={removingId === link.id} onClick={() => setPendingRemovalId(null)} type="button">ANNULER</button>
                  </span>
                ) : <button className="drive-documents-remove" onClick={() => setPendingRemovalId(link.id)} type="button">RETIRER LE LIEN</button>}
              </div>
            </article>
          ))}
          {links.length === 0 && <p className="drive-documents-state">Aucun dossier Drive lié à cette fiche.</p>}
        </div>
      )}
      {isSelectorOpen && broker && (
        <DriveFolderSelector
          broker={broker}
          entityId={entityId}
          entityType={entityType}
          onClose={() => setIsSelectorOpen(false)}
          onLinked={(link) => {
            setLinks((current) => [...current.filter((item) => item.id !== link.id), link]);
            setMessage(`Dossier « ${link.folderName} » lié au CRM.`);
            setIsSelectorOpen(false);
          }}
        />
      )}
    </section>
  );
}
