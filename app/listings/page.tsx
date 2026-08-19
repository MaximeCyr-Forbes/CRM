"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useBroker } from "../broker-context";
import { ListingEditorModal } from "../components/listing-editor-modal";
import { ListingMedia } from "../components/listing-media";
import { useContacts } from "../contacts-context";
import { BROKER_LABELS } from "../data/contact-types";
import {
  emptyListingDraft,
  listingDraftFromListing,
} from "../lib/listings/editor";
import {
  LISTING_BROKERS,
  LISTING_PROPERTY_TYPE_LABELS,
  LISTING_PURPOSE_LABELS,
  LISTING_PURPOSES,
  LISTING_STATUS_LABELS,
  type Listing,
} from "../data/listing-types";
import {
  LISTING_STATUS_FILTERS,
  buildContactNameMap,
  filterListings,
  listingAddressLines,
  listingBrokerFilterFromParam,
  listingOwnerNames,
  listingPriceLabel,
  listingPurposeFilterFromParam,
  listingStatusFilterFromParam,
  type ListingBrokerFilter,
  type ListingPurposeFilter,
  type ListingStatusFilter,
} from "../lib/listings/presentation";
import { useListings } from "../listings-context";

export default function ListingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedBroker } = useBroker();
  const { contacts } = useContacts();
  const { listings, isLoading, isSaving, error, retry, createListing, updateListing } = useListings();
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const brokerFilter = listingBrokerFilterFromParam(searchParams.get("broker"));
  const purposeFilter = listingPurposeFilterFromParam(searchParams.get("purpose"));
  const statusFilter = listingStatusFilterFromParam(searchParams.get("status"));
  const contactNames = useMemo(() => buildContactNameMap(contacts), [contacts]);
  const visibleListings = useMemo(() => filterListings(listings, {
    broker: brokerFilter,
    purpose: purposeFilter,
    status: statusFilter,
    search,
  }), [brokerFilter, listings, purposeFilter, search, statusFilter]);
  const activeCount = listings.filter((listing) => listing.status === "active").length;
  const selectedBrokerKey = selectedBroker?.toLowerCase();
  const defaultBroker = LISTING_BROKERS.includes(selectedBrokerKey as Listing["broker"])
    ? selectedBrokerKey as Listing["broker"]
    : LISTING_BROKERS[0];

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  useEffect(() => {
    const notice = window.sessionStorage.getItem("listingNotice");
    if (!notice) return;
    window.sessionStorage.removeItem("listingNotice");
    setConfirmation(notice);
  }, []);

  function updateFilter(name: "broker" | "purpose" | "status", value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === "all" && name !== "status") next.delete(name);
    else next.set(name, value);
    const query = next.toString();
    router.push(query ? `/listings?${query}` : "/listings");
  }

  function openListing(listingId: string) {
    window.sessionStorage.setItem("listingOriginId", listingId);
    router.push(`/listings/${listingId}`);
  }

  return (
    <main className="listings-page">
      <div className="listings-shell">
        <header className="listings-header">
          <div>
            <p className="section-kicker">Inventaire de l’équipe</p>
            <h1>LISTINGS</h1>
            <p>Propriétés actuellement représentées par l’Équipe Forbes.</p>
          </div>
          <div className="listings-header-actions">
            <div className="listings-summary" aria-live="polite">
              <strong>{isLoading || error ? "—" : activeCount}</strong>
              <span>{isLoading ? "Chargement…" : error ? "Données indisponibles" : `${activeCount === 1 ? "listing actif" : "listings actifs"}`}</span>
            </div>
            <button className="listing-new" onClick={() => setIsCreating(true)} type="button">+ Nouveau Listing</button>
          </div>
        </header>

        <section className="listings-filters" aria-label="Filtres des Listings">
          <div className="listings-filter-block">
            <span>Courtier</span>
            <div className="listings-filter-options">
              {(["all", ...LISTING_BROKERS] as ListingBrokerFilter[]).map((broker) => (
                <button aria-pressed={brokerFilter === broker} key={broker} onClick={() => updateFilter("broker", broker)} type="button">
                  {broker === "all" ? "Tous" : BROKER_LABELS[broker]}
                </button>
              ))}
            </div>
          </div>

          <div className="listings-filter-block listings-status-filters">
            <span>Statut</span>
            <div className="listings-filter-options">
              {LISTING_STATUS_FILTERS.map((filter) => (
                <button aria-pressed={statusFilter === filter.key} key={filter.key} onClick={() => updateFilter("status", filter.query)} type="button">
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="listings-filter-block">
            <span>Marché</span>
            <div className="listings-filter-options">
              {(["all", ...LISTING_PURPOSES] as ListingPurposeFilter[]).map((purpose) => (
                <button aria-pressed={purposeFilter === purpose} key={purpose} onClick={() => updateFilter("purpose", purpose)} type="button">
                  {purpose === "all" ? "Tous" : LISTING_PURPOSE_LABELS[purpose]}
                </button>
              ))}
            </div>
          </div>

          <label className="listings-search">
            <span>Rechercher un Listing</span>
            <span className="listings-search-field">
              <span aria-hidden="true">⌕</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Adresse, ville ou numéro Centris"
                type="search"
                value={search}
              />
            </span>
          </label>
        </section>

        {error && (
          <div className="listings-state listings-state-error" role="alert">
            <div><strong>Listings temporairement indisponibles.</strong><span>Réessayez dans quelques instants.</span></div>
            <button onClick={() => void retry()} type="button">Réessayer</button>
          </div>
        )}

        {isLoading && !error && (
          <div className="listings-loading" aria-live="polite">
            <span>Chargement de l’inventaire…</span>
            <div className="listings-loading-grid" aria-hidden="true">
              {[0, 1, 2].map((item) => <div key={item} />)}
            </div>
          </div>
        )}

        {!isLoading && !error && (
          <section className="listings-grid" aria-label="Inventaire immobilier" aria-live="polite">
            {visibleListings.map((listing) => {
              const addressLines = listingAddressLines(listing);
              const owners = listingOwnerNames(listing, contactNames);
              return (
                <article className="listing-card" key={listing.id}>
                  <div className="listing-card-media">
                    <ListingMedia listing={listing} />
                    <span className={`listing-purpose-badge listing-purpose-${listing.purpose}`}>
                      {LISTING_PURPOSE_LABELS[listing.purpose]}
                    </span>
                    <span className={`listing-status-badge listing-status-${listing.status}`}>
                      {LISTING_STATUS_LABELS[listing.status]}
                    </span>
                  </div>
                  <div className="listing-card-content">
                    <div className="listing-card-address">
                      <h2>
                        <button
                          aria-label={`Ouvrir la fiche du Listing ${addressLines[0]}`}
                          className="listing-card-address-link"
                          onClick={() => openListing(listing.id)}
                          type="button"
                        >
                          {addressLines[0]}
                        </button>
                      </h2>
                      <p>{addressLines[1] || "Localité à confirmer"}</p>
                    </div>
                    <strong className="listing-card-price">{listingPriceLabel(listing)}</strong>
                    <dl className="listing-card-details">
                      <div><dt>Courtier</dt><dd><span className={`listing-broker listing-broker-${listing.broker}`}>{BROKER_LABELS[listing.broker]}</span></dd></div>
                      <div><dt>Type de propriété</dt><dd>{LISTING_PROPERTY_TYPE_LABELS[listing.propertyType]}</dd></div>
                      {listing.centrisNumber && <div><dt>Numéro Centris</dt><dd>{listing.centrisNumber}</dd></div>}
                      <div className="listing-card-owners"><dt>{owners.length > 1 ? "Propriétaires" : "Propriétaire"}</dt><dd>{owners.length ? owners.join(" · ") : "Non renseigné"}</dd></div>
                    </dl>
                    <div className="listing-card-actions">
                      <button className="listing-card-open" onClick={() => openListing(listing.id)} type="button">Ouvrir <span aria-hidden="true">→</span></button>
                      <button className="listing-card-edit" onClick={() => setEditingListing(listing)} type="button">Modifier <span aria-hidden="true">✎</span></button>
                    </div>
                  </div>
                </article>
              );
            })}
            {visibleListings.length === 0 && (
              <div className="listings-empty">
                <span aria-hidden="true">◇</span>
                <h2>{listings.length === 0 ? "AUCUN LISTING ACTIF" : "AUCUN LISTING TROUVÉ"}</h2>
                <p>{listings.length === 0
                  ? "Les propriétés de l’équipe apparaîtront ici lorsqu’elles seront ajoutées."
                  : "Aucune propriété ne correspond aux filtres sélectionnés."}</p>
              </div>
            )}
          </section>
        )}
      </div>
      {confirmation && <div aria-live="polite" className="follow-up-confirmation" role="status"><span aria-hidden="true">✓</span><strong>{confirmation}</strong></div>}
      {isCreating && <ListingEditorModal
        initial={emptyListingDraft(defaultBroker)}
        isSaving={isSaving}
        mode="create"
        onClose={() => setIsCreating(false)}
        onSave={async (draft) => {
          const created = await createListing(draft);
          setIsCreating(false);
          setConfirmation(`Listing créé · statut ${LISTING_STATUS_LABELS[created.status]}`);
        }}
      />}
      {editingListing && <ListingEditorModal
        initial={listingDraftFromListing(editingListing)}
        isSaving={isSaving}
        key={editingListing.id}
        mode="edit"
        onClose={() => setEditingListing(null)}
        onSave={async (draft) => {
          const updated = await updateListing(editingListing.id, draft);
          setEditingListing(null);
          setConfirmation(`Listing modifié · statut ${LISTING_STATUS_LABELS[updated.status]}`);
        }}
      />}
    </main>
  );
}
