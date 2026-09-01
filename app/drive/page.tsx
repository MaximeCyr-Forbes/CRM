"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from "react";
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
import {
  googleDriveFolderHref,
  googleDriveRootHref,
  googleDriveSearchHref,
  readGoogleDriveLocation,
} from "../lib/google-drive/navigation";
import { isAbortError, requestGoogleDriveSearch } from "../lib/google-drive/search-client";

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
const DRIVE_CONTENT_HEADER_GAP = 12;
const DRIVE_HISTORY_ENTRY_KEY = "__forbesDriveEntry";
const DRIVE_HISTORY_DEPTH_KEY = "__forbesDriveDepth";

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

function scrollDriveContentIntoView(target: HTMLElement) {
  const header = document.querySelector<HTMLElement>(".app-header");
  const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
  const targetTop = target.getBoundingClientRect().top;
  window.scrollTo({
    top: Math.max(0, window.scrollY + targetTop - headerBottom - DRIVE_CONTENT_HEADER_GAP),
    behavior: "auto",
  });
}

function DriveItemCard({ item, links = [], folderHref, onFolderLinkClick, onFolderLinkKeyDown }: {
  item: GoogleDriveItem;
  links?: GoogleDriveEntityLink[];
  folderHref?: string;
  onFolderLinkClick(event: MouseEvent<HTMLAnchorElement>, href: string): void;
  onFolderLinkKeyDown(event: KeyboardEvent<HTMLAnchorElement>, href: string): void;
}) {
  const size = formatSize(item.size);
  return (
    <article className="drive-item-card">
      <div className={`drive-item-icon ${item.isFolder ? "drive-item-icon-folder" : ""}`} aria-hidden="true">
        {item.isFolder ? "▱" : "◇"}
      </div>
      <div className="drive-item-copy">
        <span>{fileKind(item)}</span>
        <h3>
          {item.isFolder && folderHref ? (
            <a className="drive-folder-name-link" href={folderHref} onClick={(event) => onFolderLinkClick(event, folderHref)} onKeyDown={(event) => onFolderLinkKeyDown(event, folderHref)}>{item.name}</a>
          ) : item.name}
        </h3>
        <p>{formatModified(item.modifiedTime)}{size ? ` · ${size}` : ""}</p>
        {links.length > 0 && <div className="drive-entity-links">{links.map((link) => <span key={link.id}>Lié à : {link.entityType === "contact" ? "Contact" : link.entityType === "listing" ? "Listing" : "Transaction"} · {link.entityLabel}</span>)}</div>}
      </div>
      {item.isFolder && folderHref ? (
        <a className="drive-open-folder-link" href={folderHref} onClick={(event) => onFolderLinkClick(event, folderHref)} onKeyDown={(event) => onFolderLinkKeyDown(event, folderHref)}>OUVRIR</a>
      ) : item.webViewLink ? (
        <a href={item.webViewLink} rel="noopener noreferrer" target="_blank">OUVRIR DANS GOOGLE DRIVE ↗</a>
      ) : (
        <span className="drive-item-unavailable">Lien indisponible</span>
      )}
    </article>
  );
}

export default function DrivePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const broker = selectedBroker ? BROKER_KEYS[selectedBroker] : null;
  const locationKey = searchParams.toString();
  const driveLocation = useMemo(() => readGoogleDriveLocation(searchParams), [locationKey, searchParams]);
  const [connection, setConnection] = useState<CalendarConnectionStatus | null>(null);
  const [roots, setRoots] = useState<GoogleDriveRoot[]>([]);
  const [rootsLoadedBroker, setRootsLoadedBroker] = useState<CalendarBroker | null>(null);
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
  const driveContentRef = useRef<HTMLElement>(null);
  const rootsAbortRef = useRef<AbortController | null>(null);
  const rootsRequestIdRef = useRef(0);
  const browseAbortRef = useRef<AbortController | null>(null);
  const browseRequestIdRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const pendingHistoryDepthRef = useRef<number | null>(null);
  const previousBrokerRef = useRef<CalendarBroker | null>(broker);

  const browse = useCallback(async (
    root: GoogleDriveRoot,
    folderId?: string,
    signal?: AbortSignal,
  ): Promise<GoogleDriveFolderListing> => {
    if (!broker) throw new Error("Sélectionnez d’abord le courtier à consulter.");
    const search = new URLSearchParams({ broker, rootId: root.id });
    if (folderId) search.set("folderId", folderId);
    const response = await fetch(`/api/google-drive/browse?${search.toString()}`, { cache: "no-store", signal });
    const payload = await response.json().catch(() => null) as { data?: GoogleDriveFolderListing; error?: string } | null;
    if (response.status === 403) throw new Error("Ce dossier ne fait pas partie des dossiers Drive autorisés.");
    if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Lecture Google Drive impossible.");
    return payload.data;
  }, [broker]);

  const loadRoots = useCallback(async () => {
    rootsAbortRef.current?.abort();
    const controller = new AbortController();
    const requestId = rootsRequestIdRef.current + 1;
    rootsRequestIdRef.current = requestId;
    rootsAbortRef.current = controller;
    if (!broker) {
      setRoots([]);
      setEntityLinks([]);
      setConnection(null);
      setRootsLoadedBroker(null);
      return;
    }
    setIsLoading(true);
    setRootsLoadedBroker(null);
    setError(null);
    try {
      const [rootsResponse, connectionsResponse, linksResponse] = await Promise.all([
        fetch(`/api/google-drive/roots?broker=${broker}`, { cache: "no-store", signal: controller.signal }),
        fetch("/api/google-calendar/connections", { cache: "no-store", signal: controller.signal }),
        fetch(`/api/google-drive/entity-links?broker=${broker}`, { cache: "no-store", signal: controller.signal }),
      ]);
      const rootsPayload = await rootsResponse.json().catch(() => null) as { roots?: GoogleDriveRoot[]; error?: string } | null;
      const connectionsPayload = await connectionsResponse.json().catch(() => null) as { connections?: CalendarConnectionStatus[]; error?: string } | null;
      const linksPayload = await linksResponse.json().catch(() => null) as { links?: GoogleDriveEntityLink[] } | null;
      if (!rootsResponse.ok || !rootsPayload?.roots) throw new Error(rootsPayload?.error ?? "Chargement des dossiers impossible.");
      if (!connectionsResponse.ok || !connectionsPayload?.connections) throw new Error(connectionsPayload?.error ?? "Connexion Google indisponible.");
      if (rootsRequestIdRef.current !== requestId) return;
      setRoots(rootsPayload.roots);
      setEntityLinks(linksResponse.ok && linksPayload?.links ? linksPayload.links : []);
      setConnection(connectionsPayload.connections.find((item) => item.broker === broker) ?? null);
      const states = await Promise.all(rootsPayload.roots.map(async (root): Promise<[string, RootState]> => {
        try {
          return [root.id, { listing: await browse(root, undefined, controller.signal) }];
        } catch (caughtError) {
          if (isAbortError(caughtError)) throw caughtError;
          return [root.id, { error: caughtError instanceof Error ? caughtError.message : "Dossier inaccessible." }];
        }
      }));
      if (rootsRequestIdRef.current !== requestId) return;
      setRootStates(Object.fromEntries(states));
      setRootsLoadedBroker(broker);
    } catch (caughtError) {
      if (rootsRequestIdRef.current !== requestId || isAbortError(caughtError)) return;
      setError(caughtError instanceof Error ? caughtError.message : "Google Drive est temporairement indisponible.");
    } finally {
      if (rootsRequestIdRef.current === requestId) {
        rootsAbortRef.current = null;
        setIsLoading(false);
      }
    }
  }, [broker, browse]);

  useEffect(() => {
    browseRequestIdRef.current += 1;
    browseAbortRef.current?.abort();
    browseAbortRef.current = null;
    searchRequestIdRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setIsSearching(false);
    setActiveListing(null);
    setSearchResults(null);
    setRootStates({});
    void loadRoots();
  }, [loadRoots]);

  useEffect(() => {
    const previousBroker = previousBrokerRef.current;
    previousBrokerRef.current = broker;
    if (previousBroker && broker && previousBroker !== broker && driveLocation.mode !== "roots") {
      router.replace("/drive", { scroll: false });
    }
  }, [broker, driveLocation.mode, router]);

  useEffect(() => {
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state as Record<string, unknown>
      : {};
    const existingDepth = currentState[DRIVE_HISTORY_ENTRY_KEY] === true
      && typeof currentState[DRIVE_HISTORY_DEPTH_KEY] === "number"
      ? currentState[DRIVE_HISTORY_DEPTH_KEY] as number
      : 0;
    const depth = pendingHistoryDepthRef.current ?? existingDepth;
    pendingHistoryDepthRef.current = null;
    window.history.replaceState({
      ...currentState,
      [DRIVE_HISTORY_ENTRY_KEY]: true,
      [DRIVE_HISTORY_DEPTH_KEY]: depth,
    }, "", window.location.href);
  }, [locationKey]);

  useEffect(() => {
    browseRequestIdRef.current += 1;
    browseAbortRef.current?.abort();
    browseAbortRef.current = null;
    searchRequestIdRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setIsSearching(false);
    setActiveListing(null);
    setSearchResults(null);
    setSearchTruncated(false);
    setError(null);

    if (!broker || rootsLoadedBroker !== broker || !connection?.driveEnabled) return;

    if (driveLocation.mode === "roots") {
      setQuery("");
      setIsLoading(false);
      return;
    }

    if (driveLocation.mode === "search") {
      const controller = new AbortController();
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      searchAbortRef.current = controller;
      setQuery(driveLocation.query);
      setIsLoading(false);
      setIsSearching(true);
      void requestGoogleDriveSearch(broker, driveLocation.query, { signal: controller.signal })
        .then((data) => {
          if (searchRequestIdRef.current !== requestId) return;
          setSearchResults(data.results);
          setSearchTruncated(data.truncated);
        })
        .catch((caughtError) => {
          if (searchRequestIdRef.current !== requestId || isAbortError(caughtError)) return;
          setError(caughtError instanceof Error ? caughtError.message : "Recherche Google Drive impossible.");
        })
        .finally(() => {
          if (searchRequestIdRef.current === requestId) {
            searchAbortRef.current = null;
            setIsSearching(false);
          }
        });
      return () => controller.abort();
    }

    setQuery("");
    const root = roots.find((candidate) => candidate.id === driveLocation.rootId);
    if (!root) {
      setIsLoading(false);
      setError("Le dossier partagé est introuvable pour ce courtier.");
      return;
    }
    const controller = new AbortController();
    const requestId = browseRequestIdRef.current + 1;
    browseRequestIdRef.current = requestId;
    browseAbortRef.current = controller;
    setIsLoading(true);
    void browse(root, driveLocation.folderId ?? undefined, controller.signal)
      .then((listing) => {
        if (browseRequestIdRef.current !== requestId) return;
        setActiveListing(listing);
      })
      .catch((caughtError) => {
        if (browseRequestIdRef.current !== requestId || isAbortError(caughtError)) return;
        setError(caughtError instanceof Error ? caughtError.message : "Ce dossier est inaccessible.");
      })
      .finally(() => {
        if (browseRequestIdRef.current === requestId) {
          browseAbortRef.current = null;
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [
    broker,
    browse,
    connection?.driveEnabled,
    driveLocation.mode,
    driveLocation.mode === "folder" ? driveLocation.folderId : null,
    driveLocation.mode === "folder" ? driveLocation.rootId : null,
    driveLocation.mode === "search" ? driveLocation.query : null,
    roots,
    rootsLoadedBroker,
  ]);

  useEffect(() => {
    const shouldScroll = (driveLocation.mode === "folder" && activeListing)
      || (driveLocation.mode === "search" && searchResults);
    if (!shouldScroll || !driveContentRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (driveContentRef.current) scrollDriveContentIntoView(driveContentRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeListing, driveLocation.mode, searchResults]);

  useEffect(() => () => {
    rootsRequestIdRef.current += 1;
    rootsAbortRef.current?.abort();
    browseRequestIdRef.current += 1;
    browseAbortRef.current?.abort();
    searchRequestIdRef.current += 1;
    searchAbortRef.current?.abort();
  }, []);

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

  function navigateDrive(href: string) {
    prepareDriveNavigation();
    router.push(href, { scroll: false });
  }

  function prepareDriveNavigation() {
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state as Record<string, unknown>
      : {};
    const currentDepth = currentState[DRIVE_HISTORY_ENTRY_KEY] === true
      && typeof currentState[DRIVE_HISTORY_DEPTH_KEY] === "number"
      ? currentState[DRIVE_HISTORY_DEPTH_KEY] as number
      : 0;
    pendingHistoryDepthRef.current = currentDepth + 1;
  }

  function openDriveLink(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateDrive(href);
  }

  function openDriveLinkFromKeyboard(event: KeyboardEvent<HTMLAnchorElement>, href: string) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    navigateDrive(href);
  }

  function searchDrive(event: FormEvent) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!broker || !normalizedQuery) {
      navigateDrive("/drive");
      return;
    }
    navigateDrive(googleDriveSearchHref(normalizedQuery));
  }

  function clearSearch() {
    navigateDrive("/drive");
  }

  function goBackWithinDrive() {
    const currentState = window.history.state && typeof window.history.state === "object"
      ? window.history.state as Record<string, unknown>
      : {};
    const hasPreviousDriveEntry = currentState[DRIVE_HISTORY_ENTRY_KEY] === true
      && typeof currentState[DRIVE_HISTORY_DEPTH_KEY] === "number"
      && currentState[DRIVE_HISTORY_DEPTH_KEY] > 0;
    if (hasPreviousDriveEntry) router.back();
    else navigateDrive("/drive");
  }

  async function removeRoot() {
    if (!broker || !pendingRemoval || isRemoving) return;
    setIsRemoving(true);
    setError(null);
    try {
      const response = await fetch(`/api/google-drive/roots/${pendingRemoval.id}?broker=${broker}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Le dossier n’a pas pu être retiré.");
      if (driveLocation.mode === "folder" && driveLocation.rootId === pendingRemoval.id) {
        router.replace("/drive", { scroll: false });
      }
      setMessage("L’accès en lecture du CRM a été révoqué. Le dossier et ses fichiers restent intacts dans Google Drive.");
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
                if (!event.target.value && driveLocation.mode === "search") clearSearch();
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

        {broker && connection?.driveEnabled && !isLoading && driveLocation.mode === "roots" && (
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
                  const folderName = state?.listing?.folder.name ?? root.folderName;
                  const folderHref = googleDriveRootHref(root.id);
                  return (
                    <article className={state?.error ? "drive-root-card drive-root-card-error" : "drive-root-card"} key={root.id}>
                      <span aria-hidden="true">▱</span>
                      <div>
                        <small>{root.driveId ? "DRIVE PARTAGÉ" : "DOSSIER GOOGLE DRIVE"}</small>
                        <h3>
                          {state?.error ? folderName : (
                            <a className="drive-folder-name-link" href={folderHref} onClick={(event) => openDriveLink(event, folderHref)} onKeyDown={(event) => openDriveLinkFromKeyboard(event, folderHref)}>{folderName}</a>
                          )}
                        </h3>
                        <p>{state?.error ?? formatModified(state?.listing?.folder.modifiedTime ?? root.updatedAt)}</p>
                        {entityLinks.some((link) => link.folderId === root.folderId) && <div className="drive-entity-links">{entityLinks.filter((link) => link.folderId === root.folderId).map((link) => <span key={link.id}>Lié à : {link.entityType === "contact" ? "Contact" : link.entityType === "listing" ? "Listing" : "Transaction"} · {link.entityLabel}</span>)}</div>}
                      </div>
                      <div>
                        {state?.error ? (
                          <button disabled type="button">OUVRIR</button>
                        ) : (
                          <a className="drive-open-folder-link" href={folderHref} onClick={(event) => openDriveLink(event, folderHref)} onKeyDown={(event) => openDriveLinkFromKeyboard(event, folderHref)}>OUVRIR</a>
                        )}
                        <button className="drive-remove-root" onClick={() => setPendingRemoval(root)} type="button">RETIRER DU CRM</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {driveLocation.mode === "folder" && !isLoading && !activeListing && error && (
          <section className="drive-location-error" ref={driveContentRef}>
            <button onClick={() => navigateDrive("/drive")} type="button">RETOUR AUX DOSSIERS RACINES</button>
          </section>
        )}

        {driveLocation.mode === "folder" && activeListing && activeRoot && (
          <section aria-labelledby="drive-folder-title" ref={driveContentRef}>
            <div className="drive-folder-navigation">
              <button className="drive-back-button" onClick={goBackWithinDrive} type="button">← RETOUR</button>
              <nav aria-label="Fil d’Ariane Google Drive" className="drive-breadcrumbs">
              <button onClick={() => navigateDrive("/drive")} type="button">DRIVE</button>
              {activeListing.breadcrumbs.map((crumb, index) => (
                <span key={crumb.id}>
                  <i aria-hidden="true">›</i>
                  <button
                    aria-current={index === activeListing.breadcrumbs.length - 1 ? "page" : undefined}
                    disabled={index === activeListing.breadcrumbs.length - 1}
                    onClick={() => navigateDrive(index === 0
                      ? googleDriveRootHref(activeRoot.id)
                      : googleDriveFolderHref(activeRoot.id, crumb.id))}
                    type="button"
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
              </nav>
            </div>
            <div className="drive-section-title drive-folder-heading">
              <div><p className="section-kicker">Dossier autorisé</p><h2 id="drive-folder-title">{activeListing.folder.name}</h2></div>
              {activeListing.folder.webViewLink && <a href={activeListing.folder.webViewLink} rel="noopener noreferrer" target="_blank">OUVRIR DANS GOOGLE DRIVE ↗</a>}
            </div>
            {activeListing.items.length === 0 ? (
              <p className="drive-state">Ce dossier est vide.</p>
            ) : (
              <div className="drive-item-grid">
                {activeListing.items.map((item) => {
                  const folderHref = item.isFolder ? googleDriveFolderHref(activeRoot.id, item.id) : undefined;
                  return (
                    <DriveItemCard
                      folderHref={folderHref}
                      item={item}
                      key={item.id}
                      links={entityLinks.filter((link) => link.folderId === item.id)}
                      onFolderLinkClick={openDriveLink}
                      onFolderLinkKeyDown={openDriveLinkFromKeyboard}
                    />
                  );
                })}
              </div>
            )}
          </section>
        )}

        {driveLocation.mode === "search" && searchResults !== null && (
          <section aria-labelledby="drive-search-results-title" ref={driveContentRef}>
            <div className="drive-section-title drive-folder-heading">
              <div>
                <p className="section-kicker">Dans les racines autorisées seulement</p>
                <h2 id="drive-search-results-title">RÉSULTATS POUR « {driveLocation.query} »</h2>
                <p>{searchResults.length} RÉSULTAT{searchResults.length === 1 ? "" : "S"}</p>
              </div>
              <button onClick={clearSearch} type="button">EFFACER LA RECHERCHE</button>
            </div>
            {searchTruncated && <p className="drive-notice">Les premiers résultats sont affichés. Précisez la recherche pour réduire la liste.</p>}
            {searchResults.length === 0 ? (
              <p className="drive-state">Aucun résultat dans les dossiers partagés avec le CRM.</p>
            ) : (
              <div className="drive-item-grid">
                {searchResults.map((item) => {
                  const folderHref = item.isFolder ? googleDriveFolderHref(item.rootId, item.id) : undefined;
                  return (
                    <div className="drive-search-result" key={`${item.rootId}-${item.id}`}>
                      <p>{[item.rootName, ...item.breadcrumbs.slice(1).map((crumb) => crumb.name)].join(" › ")}</p>
                      <DriveItemCard
                        folderHref={folderHref}
                        item={item}
                        links={entityLinks.filter((link) => link.folderId === item.id)}
                        onFolderLinkClick={openDriveLink}
                        onFolderLinkKeyDown={openDriveLinkFromKeyboard}
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
            <p className="section-kicker">Révocation de l’accès CRM</p>
            <h2 id="drive-remove-title">Retirer ce dossier du CRM ?</h2>
            <p><strong>{pendingRemoval.folderName}</strong></p>
            <p>La permission de lecture du CRM sera révoquée. Le dossier et ses fichiers resteront intacts dans Google Drive.</p>
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
