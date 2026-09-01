"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { type Broker, useBroker } from "../broker-context";
import type { CalendarBroker, CalendarConnectionStatus } from "../data/calendar-types";
import { BROKER_LABELS } from "../data/contact-types";
import type {
  GoogleDriveFolderListing,
  GoogleDriveEntityLink,
  GoogleDriveItem,
  GoogleDriveRoot,
  GoogleDriveSearchResult,
} from "../data/google-drive-types";
import { pickGoogleDriveFolder } from "../lib/google-drive/picker-client";

const BROKER_KEYS: Record<Broker, CalendarBroker> = {
  France: "france",
  Maxime: "maxime",
  Sandrine: "sandrine",
};

const dateFormatter = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});
const sizeFormatter = new Intl.NumberFormat("fr-CA", {
  maximumFractionDigits: 1,
});

type RootState = {
  listing?: GoogleDriveFolderListing;
  error?: string;
};

function formatModified(value: string | null | undefined) {
  if (!value) return "Date de modification indisponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date de modification indisponible"
    : `Modifié ${dateFormatter.format(date)}`;
}

function formatSize(value: string | null) {
  const bytes = value ? Number(value) : Number.NaN;
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 ** 2) return `${sizeFormatter.format(bytes / 1024)} Ko`;
  if (bytes < 1024 ** 3) return `${sizeFormatter.format(bytes / 1024 ** 2)} Mo`;
  return `${sizeFormatter.format(bytes / 1024 ** 3)} Go`;
}

function fileKind(item: GoogleDriveItem) {
  if (item.isFolder) return "Dossier";
  if (item.mimeType === "application/pdf") return "PDF";
  if (item.mimeType === "application/vnd.google-apps.document") return "Google Docs";
  if (item.mimeType === "application/vnd.google-apps.spreadsheet") return "Google Sheets";
  if (item.mimeType.startsWith("image/")) return "Image";
  if (item.mimeType.includes("wordprocessingml") || item.mimeType === "application/msword") return "Word";
  if (item.mimeType.includes("spreadsheetml") || item.mimeType === "application/vnd.ms-excel") return "Excel";
  return "Fichier";
}

function DriveItemCard({ item, links = [], onOpenFolder }: {
  item: GoogleDriveItem;
  links?: GoogleDriveEntityLink[];
  onOpenFolder(): void;
}) {
  const size = formatSize(item.size);
  return (
    <article className="drive-item-card">
      <div className={`drive-item-icon ${item.isFolder ? "drive-item-icon-folder" : ""}`} aria-hidden="true">
        {item.isFolder ? "▱" : "◇"}
      </div>
      <div className="drive-item-copy">
        <span>{fileKind(item)}</span>
        <h3>{item.name}</h3>
        <p>{formatModified(item.modifiedTime)}{size ? ` · ${size}` : ""}</p>
        {links.length > 0 && <div className="drive-entity-links">{links.map((link) => <span key={link.id}>Lié à : {link.entityType === "contact" ? "Contact" : link.entityType === "listing" ? "Listing" : "Transaction"} · {link.entityLabel}</span>)}</div>}
      </div>
      {item.isFolder ? (
        <button onClick={onOpenFolder} type="button">OUVRIR</button>
      ) : item.webViewLink ? (
        <a href={item.webViewLink} rel="noopener noreferrer" target="_blank">OUVRIR DANS GOOGLE DRIVE ↗</a>
      ) : (
        <span className="drive-item-unavailable">Lien indisponible</span>
      )}
    </article>
  );
}

export default function DrivePage() {
  const { selectedBroker } = useBroker();
  const broker = selectedBroker ? BROKER_KEYS[selectedBroker] : null;
  const [connection, setConnection] = useState<CalendarConnectionStatus | null>(null);
  const [roots, setRoots] = useState<GoogleDriveRoot[]>([]);
  const [rootStates, setRootStates] = useState<Record<string, RootState>>({});
  const [entityLinks, setEntityLinks] = useState<GoogleDriveEntityLink[]>([]);
  const [activeListing, setActiveListing] = useState<GoogleDriveFolderListing | null>(null);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GoogleDriveSearchResult[] | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<GoogleDriveRoot | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pickerLock = useRef(false);

  const browse = useCallback(async (root: GoogleDriveRoot, folderId?: string): Promise<GoogleDriveFolderListing> => {
    if (!broker) throw new Error("Sélectionnez d’abord le courtier à consulter.");
    const search = new URLSearchParams({ broker, rootId: root.id });
    if (folderId) search.set("folderId", folderId);
    const response = await fetch(`/api/google-drive/browse?${search.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { data?: GoogleDriveFolderListing; error?: string } | null;
    if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Lecture Google Drive impossible.");
    return payload.data;
  }, [broker]);

  const loadRoots = useCallback(async () => {
    if (!broker) {
      setRoots([]);
      setEntityLinks([]);
      setConnection(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [rootsResponse, connectionsResponse, linksResponse] = await Promise.all([
        fetch(`/api/google-drive/roots?broker=${broker}`, { cache: "no-store" }),
        fetch("/api/google-calendar/connections", { cache: "no-store" }),
        fetch(`/api/google-drive/entity-links?broker=${broker}`, { cache: "no-store" }),
      ]);
      const rootsPayload = await rootsResponse.json().catch(() => null) as { roots?: GoogleDriveRoot[]; error?: string } | null;
      const connectionsPayload = await connectionsResponse.json().catch(() => null) as { connections?: CalendarConnectionStatus[]; error?: string } | null;
      const linksPayload = await linksResponse.json().catch(() => null) as { links?: GoogleDriveEntityLink[] } | null;
      if (!rootsResponse.ok || !rootsPayload?.roots) throw new Error(rootsPayload?.error ?? "Chargement des dossiers impossible.");
      if (!connectionsResponse.ok || !connectionsPayload?.connections) throw new Error(connectionsPayload?.error ?? "Connexion Google indisponible.");
      setRoots(rootsPayload.roots);
      setEntityLinks(linksResponse.ok && linksPayload?.links ? linksPayload.links : []);
      setConnection(connectionsPayload.connections.find((item) => item.broker === broker) ?? null);
      const states = await Promise.all(rootsPayload.roots.map(async (root): Promise<[string, RootState]> => {
        try {
          return [root.id, { listing: await browse(root) }];
        } catch (caughtError) {
          return [root.id, { error: caughtError instanceof Error ? caughtError.message : "Dossier inaccessible." }];
        }
      }));
      setRootStates(Object.fromEntries(states));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Google Drive est temporairement indisponible.");
    } finally {
      setIsLoading(false);
    }
  }, [broker, browse]);

  useEffect(() => {
    setActiveListing(null);
    setSearchResults(null);
    setQuery("");
    setRootStates({});
    void loadRoots();
  }, [loadRoots]);

  function authorizeDrive() {
    if (broker) window.location.assign(`/api/google-calendar/connect?broker=${broker}&capability=drive&returnTo=/drive`);
  }

  async function saveRoot(folderId: string) {
    if (!broker) return;
    const response = await fetch("/api/google-drive/roots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ broker, folderId }),
    });
    const payload = await response.json().catch(() => null) as { root?: GoogleDriveRoot; error?: string } | null;
    if (!response.ok || !payload?.root) throw new Error(payload?.error ?? "Le dossier n’a pas pu être ajouté.");
    setMessage(`Dossier « ${payload.root.folderName} » ajouté au CRM.`);
    await loadRoots();
  }

  async function openPicker() {
    if (!broker || pickerLock.current) return;
    pickerLock.current = true;
    setIsOpeningPicker(true);
    setMessage(null);
    setError(null);
    try {
      const folderId = await pickGoogleDriveFolder(broker);
      if (folderId) await saveRoot(folderId);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Google Picker est temporairement indisponible.");
    } finally {
      pickerLock.current = false;
      setIsOpeningPicker(false);
    }
  }

  async function openFolder(root: GoogleDriveRoot, folderId?: string) {
    setIsLoading(true);
    setError(null);
    setSearchResults(null);
    try {
      setActiveListing(await browse(root, folderId));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Ce dossier est inaccessible.");
    } finally {
      setIsLoading(false);
    }
  }

  async function searchDrive(event: FormEvent) {
    event.preventDefault();
    if (!broker || !query.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    setError(null);
    setActiveListing(null);
    try {
      const search = new URLSearchParams({ broker, q: query.trim() });
      const response = await fetch(`/api/google-drive/search?${search.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as {
        data?: { results: GoogleDriveSearchResult[]; truncated: boolean };
        error?: string;
      } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Recherche Google Drive impossible.");
      setSearchResults(payload.data.results);
      setSearchTruncated(payload.data.truncated);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Recherche Google Drive impossible.");
    } finally {
      setIsSearching(false);
    }
  }

  async function removeRoot() {
    if (!broker || !pendingRemoval || isRemoving) return;
    setIsRemoving(true);
    setError(null);
    try {
      const response = await fetch(`/api/google-drive/roots/${pendingRemoval.id}?broker=${broker}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Le dossier n’a pas pu être retiré.");
      if (activeListing?.root.id === pendingRemoval.id) setActiveListing(null);
      setMessage("Le dossier a été retiré du CRM. Le dossier et ses fichiers restent intacts dans Google Drive.");
      setPendingRemoval(null);
      await loadRoots();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Le dossier n’a pas pu être retiré du CRM.");
    } finally {
      setIsRemoving(false);
    }
  }

  const activeRoot = activeListing ? roots.find((root) => root.id === activeListing.root.id) ?? activeListing.root : null;

  return (
    <main className="drive-page">
      <div className="drive-shell">
        <header className="drive-heading">
          <div>
            <p className="section-kicker">DOSSIERS PARTAGÉS AVEC LE CRM</p>
            <h1>GOOGLE DRIVE</h1>
            <p>Consultez uniquement les dossiers explicitement autorisés pour le courtier sélectionné.</p>
          </div>
          <div className="drive-heading-actions">
            <div><span>Courtier consulté</span><strong>{broker ? BROKER_LABELS[broker] : "Aucun"}</strong></div>
            <div><span>Connexion Google Drive</span><strong>{connection?.driveEnabled ? "Autorisée ✓" : "Autorisation requise"}</strong></div>
            {broker && connection?.driveEnabled ? (
              <button disabled={isOpeningPicker} onClick={() => void openPicker()} type="button">
                {isOpeningPicker ? "OUVERTURE…" : "+ AJOUTER UN DOSSIER"}
              </button>
            ) : broker ? (
              <button onClick={authorizeDrive} type="button">AUTORISER GOOGLE DRIVE</button>
            ) : null}
          </div>
        </header>

        {broker && connection?.driveEnabled && (
          <form className="drive-search" onSubmit={(event) => void searchDrive(event)} role="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Rechercher dans Drive"
              maxLength={120}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!event.target.value) setSearchResults(null);
              }}
              placeholder="RECHERCHER DANS DRIVE"
              value={query}
            />
            <button disabled={isSearching || !query.trim()} type="submit">{isSearching ? "RECHERCHE…" : "RECHERCHER"}</button>
          </form>
        )}

        {message && <p className="drive-notice" role="status">✓ {message}</p>}
        {error && <p className="drive-notice drive-notice-error" role="alert">{error}</p>}
        {isLoading && <p className="drive-state" role="status">Chargement de Google Drive…</p>}
        {!broker && <p className="drive-state">Sélectionnez d’abord le courtier à consulter.</p>}
        {broker && connection && !connection.driveEnabled && (
          <p className="drive-state">Google Drive doit être autorisé pour {BROKER_LABELS[broker]} avant d’afficher ses dossiers.</p>
        )}

        {broker && connection?.driveEnabled && !isLoading && searchResults === null && !activeListing && (
          <section aria-labelledby="drive-roots-title">
            <div className="drive-section-title">
              <p className="section-kicker">Accès autorisés</p>
              <h2 id="drive-roots-title">DOSSIERS RACINES</h2>
            </div>
            {roots.length === 0 ? (
              <p className="drive-state">Aucun dossier Google Drive partagé avec le CRM.</p>
            ) : (
              <div className="drive-root-grid">
                {roots.map((root) => {
                  const state = rootStates[root.id];
                  return (
                    <article className={state?.error ? "drive-root-card drive-root-card-error" : "drive-root-card"} key={root.id}>
                      <span aria-hidden="true">▱</span>
                      <div>
                        <small>{root.driveId ? "DRIVE PARTAGÉ" : "DOSSIER GOOGLE DRIVE"}</small>
                        <h3>{state?.listing?.folder.name ?? root.folderName}</h3>
                        <p>{state?.error ?? formatModified(state?.listing?.folder.modifiedTime ?? root.updatedAt)}</p>
                        {entityLinks.some((link) => link.folderId === root.folderId) && <div className="drive-entity-links">{entityLinks.filter((link) => link.folderId === root.folderId).map((link) => <span key={link.id}>Lié à : {link.entityType === "contact" ? "Contact" : link.entityType === "listing" ? "Listing" : "Transaction"} · {link.entityLabel}</span>)}</div>}
                      </div>
                      <div>
                        <button disabled={Boolean(state?.error)} onClick={() => void openFolder(root)} type="button">OUVRIR</button>
                        <button className="drive-remove-root" onClick={() => setPendingRemoval(root)} type="button">RETIRER DU CRM</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeListing && activeRoot && searchResults === null && (
          <section aria-labelledby="drive-folder-title">
            <nav aria-label="Fil d’Ariane Google Drive" className="drive-breadcrumbs">
              <button onClick={() => setActiveListing(null)} type="button">DRIVE</button>
              {activeListing.breadcrumbs.map((crumb, index) => (
                <span key={crumb.id}>
                  <i aria-hidden="true">›</i>
                  <button
                    aria-current={index === activeListing.breadcrumbs.length - 1 ? "page" : undefined}
                    disabled={index === activeListing.breadcrumbs.length - 1}
                    onClick={() => void openFolder(activeRoot, crumb.id)}
                    type="button"
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="drive-section-title drive-folder-heading">
              <div><p className="section-kicker">Dossier autorisé</p><h2 id="drive-folder-title">{activeListing.folder.name}</h2></div>
              {activeListing.folder.webViewLink && <a href={activeListing.folder.webViewLink} rel="noopener noreferrer" target="_blank">OUVRIR DANS GOOGLE DRIVE ↗</a>}
            </div>
            {activeListing.items.length === 0 ? (
              <p className="drive-state">Ce dossier est vide.</p>
            ) : (
              <div className="drive-item-grid">
                {activeListing.items.map((item) => (
                  <DriveItemCard item={item} key={item.id} links={entityLinks.filter((link) => link.folderId === item.id)} onOpenFolder={() => void openFolder(activeRoot, item.id)} />
                ))}
              </div>
            )}
          </section>
        )}

        {searchResults !== null && (
          <section aria-labelledby="drive-search-results-title">
            <div className="drive-section-title drive-folder-heading">
              <div><p className="section-kicker">Dans les racines autorisées seulement</p><h2 id="drive-search-results-title">RÉSULTATS DE RECHERCHE</h2></div>
              <button onClick={() => { setSearchResults(null); setQuery(""); }} type="button">EFFACER</button>
            </div>
            {searchTruncated && <p className="drive-notice">Les premiers résultats sont affichés. Précisez la recherche pour réduire la liste.</p>}
            {searchResults.length === 0 ? (
              <p className="drive-state">Aucun résultat dans les dossiers partagés avec le CRM.</p>
            ) : (
              <div className="drive-item-grid">
                {searchResults.map((item) => {
                  const root = roots.find((candidate) => candidate.id === item.rootId);
                  return (
                    <div className="drive-search-result" key={`${item.rootId}-${item.id}`}>
                      <p>{[item.rootName, ...item.breadcrumbs.slice(1).map((crumb) => crumb.name)].join(" › ")}</p>
                      <DriveItemCard
                        item={item}
                        links={entityLinks.filter((link) => link.folderId === item.id)}
                        onOpenFolder={() => { if (root) void openFolder(root, item.id); }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {pendingRemoval && (
        <div className="drive-modal-backdrop" role="presentation">
          <section aria-labelledby="drive-remove-title" aria-modal="true" className="drive-remove-modal" role="dialog">
            <p className="section-kicker">Accès CRM seulement</p>
            <h2 id="drive-remove-title">Retirer ce dossier du CRM ?</h2>
            <p><strong>{pendingRemoval.folderName}</strong></p>
            <p>Le dossier et ses fichiers resteront intacts dans Google Drive.</p>
            <div>
              <button disabled={isRemoving} onClick={() => setPendingRemoval(null)} type="button">ANNULER</button>
              <button disabled={isRemoving} onClick={() => void removeRoot()} type="button">{isRemoving ? "RETRAIT…" : "RETIRER DU CRM"}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
