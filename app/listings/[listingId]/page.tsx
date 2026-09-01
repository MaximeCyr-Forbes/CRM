"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ListingDeleteConfirmationModal } from "../../components/listing-delete-confirmation-modal";
import { DriveDocumentsSection } from "../../components/drive-documents-section";
import { ListingEditorModal } from "../../components/listing-editor-modal";
import { ListingMedia } from "../../components/listing-media";
import { ListingMarketSnapshot } from "../../components/listing-market-snapshot";
import { ListingPaAcceptedAction } from "../../components/listing-pa-accepted-action";
import { ListingTracking } from "../../components/listing-tracking";
import { useContacts } from "../../contacts-context";
import { BROKER_LABELS, getContactName } from "../../data/contact-types";
import {
  LISTING_PROPERTY_TYPE_LABELS,
  LISTING_PURPOSE_LABELS,
  LISTING_STATUS_LABELS,
} from "../../data/listing-types";
import { isFinalizedListing, listingDraftFromListing } from "../../lib/listings/editor";
import {
  formatListingAmount,
  formatListingDate,
  listingAddressLines,
  listingPriceLabel,
  resolveListingOwners,
} from "../../lib/listings/presentation";
import { useListings } from "../../listings-context";

export default function ListingDetailPage() {
  const params = useParams<{ listingId: string }>();
  const router = useRouter();
  const { contacts } = useContacts();
  const { listings, isLoading, isSaving, error, retry, updateListing, deleteListing } = useListings();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cameFromInventory, setCameFromInventory] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const listingId = Array.isArray(params.listingId) ? params.listingId[0] : params.listingId;
  const listing = listings.find((item) => item.id === listingId);
  const owners = useMemo(
    () => listing ? resolveListingOwners(listing, contacts) : [],
    [contacts, listing],
  );

  useEffect(() => {
    const originId = window.sessionStorage.getItem("listingOriginId");
    const notice = window.sessionStorage.getItem("listingNotice");
    window.sessionStorage.removeItem("listingOriginId");
    window.sessionStorage.removeItem("listingNotice");
    setCameFromInventory(originId === listingId);
    setConfirmation(notice);
  }, [listingId]);

  useEffect(() => {
    if (!confirmation) return;
    const timeout = window.setTimeout(() => setConfirmation(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [confirmation]);

  function returnToListings() {
    if (cameFromInventory) {
      router.back();
      return;
    }
    try {
      const previous = document.referrer ? new URL(document.referrer) : null;
      if (previous?.origin === window.location.origin && previous.pathname === "/listings") {
        router.back();
        return;
      }
    } catch {
      // Une provenance invalide ne doit pas empêcher le retour à l’inventaire.
    }
    router.push("/listings");
  }

  if (isLoading) {
    return <main className="listing-detail-page"><div className="listing-detail-state" aria-live="polite"><span>Chargement de la fiche Listing…</span></div></main>;
  }

  if (error) {
    return (
      <main className="listing-detail-page">
        <div className="listing-detail-state listing-detail-state-error" role="alert">
          <div><strong>Listing temporairement indisponible.</strong><span>La fiche n’a pas pu être chargée.</span></div>
          <button onClick={() => void retry()} type="button">Réessayer</button>
        </div>
      </main>
    );
  }

  if (!listing) {
    return (
      <main className="listing-detail-page">
        <div className="listing-detail-state">
          <div><strong>LISTING INTROUVABLE</strong><span>Ce Listing n’existe plus ou n’est pas accessible.</span></div>
          <button onClick={() => router.push("/listings")} type="button">Retour aux Listings</button>
        </div>
      </main>
    );
  }

  const addressLines = listingAddressLines(listing);
  const finalized = isFinalizedListing(listing);

  return (
    <main className="listing-detail-page">
      <div className="listing-detail-shell">
        {confirmation && <div aria-live="polite" className="follow-up-confirmation" role="status"><span aria-hidden="true">✓</span><strong>{confirmation}</strong></div>}
        <button className="listing-detail-back" onClick={returnToListings} type="button"><span aria-hidden="true">←</span> Retour aux Listings</button>

        <header className="listing-detail-header">
          <div>
            <p className="section-kicker">{LISTING_PURPOSE_LABELS[listing.purpose]} · {BROKER_LABELS[listing.broker]}</p>
            <h1>{addressLines[0]}</h1>
            <p>{addressLines[1] || "Localité à confirmer"}</p>
          </div>
          <div className="listing-detail-actions">
            <button className="listing-report-button" onClick={() => router.push(`/listings/${listing.id}/report`)} type="button">{listing.purpose === "sale" ? "Rapport vendeur" : "Rapport propriétaire"}</button>
            {finalized ? <span className="finalized-record-badge">DOSSIER FINALISÉ</span> : <>
              <button onClick={() => setIsEditing(true)} type="button">Modifier <span aria-hidden="true">✎</span></button>
              <ListingPaAcceptedAction listing={listing} onListingChanged={retry} />
              <button className="destructive-button" onClick={() => setIsDeleting(true)} type="button">Supprimer</button>
            </>}
          </div>
        </header>

        <section className="listing-detail-hero" aria-label="Aperçu du Listing">
          <div className="listing-detail-media">
            <ListingMedia listing={listing} variant="detail" />
            <span className={`listing-purpose-badge listing-purpose-${listing.purpose}`}>{LISTING_PURPOSE_LABELS[listing.purpose]}</span>
            <span className={`listing-status-badge listing-status-${listing.status}`}>{LISTING_STATUS_LABELS[listing.status]}</span>
          </div>
          <div className="listing-detail-price-panel">
            <span>{listing.status === "sold" && listing.soldPrice !== null ? "Prix vendu" : listing.purpose === "sale" ? "Prix demandé" : "Loyer mensuel"}</span>
            <strong>{listing.status === "sold" && listing.soldPrice !== null ? formatListingAmount(listing.soldPrice, "sale") : listingPriceLabel(listing)}</strong>
            <p>{LISTING_PROPERTY_TYPE_LABELS[listing.propertyType]}</p>
          </div>
        </section>

        <ListingMarketSnapshot listingId={listing.id} />

        <section className="listing-detail-section" aria-labelledby="listing-information-title">
          <div className="listing-detail-section-heading"><div><p className="section-kicker">Mandat immobilier</p><h2 id="listing-information-title">INFORMATIONS</h2></div></div>
          <dl className="listing-detail-information">
            <div><dt>Numéro Centris</dt><dd>{listing.centrisNumber || "Non renseigné"}</dd></div>
            <div><dt>Type de propriété</dt><dd>{LISTING_PROPERTY_TYPE_LABELS[listing.propertyType]}</dd></div>
            <div><dt>Courtier responsable</dt><dd>{BROKER_LABELS[listing.broker]}</dd></div>
            <div><dt>Statut</dt><dd>{LISTING_STATUS_LABELS[listing.status]}</dd></div>
            <div><dt>Type de mandat</dt><dd>{LISTING_PURPOSE_LABELS[listing.purpose]}</dd></div>
            <div><dt>Date de mise en marché</dt><dd>{formatListingDate(listing.listingDate)}</dd></div>
            <div><dt>Date d’expiration</dt><dd>{formatListingDate(listing.expirationDate)}</dd></div>
          </dl>
          {listing.status === "sold" && (
            <div className="listing-sale-result">
              <h3>RÉSULTAT DE LA VENTE</h3>
              <dl className="listing-detail-information">
                <div><dt>Prix demandé</dt><dd>{listing.askingPrice === null ? "Non renseigné" : formatListingAmount(listing.askingPrice, "sale")}</dd></div>
                <div><dt>Prix vendu</dt><dd>{listing.soldPrice === null ? "Non renseigné" : formatListingAmount(listing.soldPrice, "sale")}</dd></div>
                <div><dt>Date du notaire</dt><dd>{formatListingDate(listing.notaryDate)}</dd></div>
                <div><dt>Courtier collaborateur</dt><dd>{listing.collaboratingBrokerName || "Aucun"}</dd></div>
              </dl>
            </div>
          )}
          {(listing.centrisUrl || listing.publicUrl) && (
            <div className="listing-detail-links-block">
              <h3>LIENS</h3>
              <div className="listing-detail-links">
                {listing.centrisUrl && <a href={listing.centrisUrl} rel="noopener noreferrer" target="_blank">Voir sur Centris <span aria-hidden="true">↗</span></a>}
                {listing.publicUrl && <a href={listing.publicUrl} rel="noopener noreferrer" target="_blank">Voir la fiche publique <span aria-hidden="true">↗</span></a>}
              </div>
            </div>
          )}
        </section>

        <section className="listing-detail-section" aria-labelledby="listing-owners-title">
          <div className="listing-detail-section-heading"><div><p className="section-kicker">Contacts liés</p><h2 id="listing-owners-title">PROPRIÉTAIRES</h2></div><span>{owners.length}</span></div>
          {owners.length === 0 ? <p className="listing-detail-empty">Aucun propriétaire lié à ce Listing.</p> : (
            <div className="listing-owner-list">
              {owners.map(({ contactId, contact }) => contact ? (
                <article className="listing-owner-card" key={contactId}>
                  <div>
                    <button aria-label={`Ouvrir la fiche de ${getContactName(contact)}`} onClick={() => router.push(`/contacts/${contact.id}`)} type="button">{getContactName(contact)}</button>
                    <p>{[contact.phone, contact.email].filter(Boolean).join(" · ") || "Coordonnées non renseignées"}</p>
                  </div>
                  <button onClick={() => router.push(`/contacts/${contact.id}`)} type="button">Ouvrir la fiche <span aria-hidden="true">→</span></button>
                </article>
              ) : (
                <article className="listing-owner-card listing-owner-missing" key={contactId}>
                  <div><strong>Contact lié temporairement indisponible</strong><p>La relation est conservée dans le Listing.</p></div>
                </article>
              ))}
            </div>
          )}
        </section>

        <DriveDocumentsSection broker={listing.broker} entityId={listing.id} entityType="listing" />

        <section className="listing-detail-section" aria-labelledby="listing-notes-title">
          <div className="listing-detail-section-heading"><div><p className="section-kicker">Suivi interne</p><h2 id="listing-notes-title">NOTES INTERNES</h2></div></div>
          <p className={listing.generalNotes ? "listing-detail-notes" : "listing-detail-empty"}>{listing.generalNotes || "Aucune note interne pour le moment."}</p>
        </section>

        <ListingTracking listing={listing} key={listing.updatedAt} ownerNames={owners.flatMap(({ contact }) => contact ? [getContactName(contact)] : [])} onListingChanged={retry} />
      </div>

      {isEditing && <ListingEditorModal
        initial={listingDraftFromListing(listing)}
        isSaving={isSaving}
        key={listing.id}
        mode="edit"
        onClose={() => setIsEditing(false)}
        onSave={async (draft) => {
          await updateListing(listing.id, draft);
          setIsEditing(false);
        }}
      />}
      {isDeleting && <ListingDeleteConfirmationModal
        address={addressLines[0]}
        isSaving={isSaving}
        onClose={() => setIsDeleting(false)}
        onConfirm={async () => {
          await deleteListing(listing.id);
          window.sessionStorage.setItem("listingNotice", "Listing supprimé.");
          router.push("/listings");
        }}
      />}
    </main>
  );
}
