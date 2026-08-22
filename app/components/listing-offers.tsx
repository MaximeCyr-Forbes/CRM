"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BROKER_LABELS } from "../data/contact-types";
import {
  LISTING_OFFER_STATUS_LABELS,
  type Listing,
  type ListingOffer,
} from "../data/listing-types";
import { formatListingAmount, listingAddressLines } from "../lib/listings/presentation";
import { useListingOffers } from "../lib/listings/use-listing-offers";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
import { useTransactions } from "../transactions-context";
import { ListingOfferModal } from "./listing-offer-modal";

const date = new Intl.DateTimeFormat("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const displayDate = (value: string) => date.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));

function ConfirmationModal({ title, children, confirmLabel, isSaving, destructive = false, onClose, onConfirm }: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  isSaving: boolean;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  useDialogLifecycle(true, onClose);
  return <div className="listing-editor-backdrop" role="presentation"><section aria-labelledby="listing-offer-confirm-title" aria-modal="true" className="listing-delete-modal listing-offer-confirm" role="dialog"><header className="listing-editor-heading"><div><p className="section-kicker">Confirmation</p><h2 id="listing-offer-confirm-title">{title}</h2></div><button aria-label="Fermer" onClick={onClose} type="button">×</button></header><div className="listing-delete-content">{children}{error && <p className="listing-editor-error" role="alert">{error}</p>}</div><footer className="listing-delete-actions"><button onClick={onClose} type="button">Annuler</button><button className={destructive ? "destructive-button" : "listing-editor-submit"} disabled={isSaving} onClick={() => void onConfirm().catch((caught) => setError(caught instanceof Error ? caught.message : "Action impossible."))} type="button">{isSaving ? "Traitement…" : confirmLabel}</button></footer></section></div>;
}

export function ListingOffers({ listing, ownerNames, onChanged }: {
  listing: Listing;
  ownerNames: string[];
  onChanged: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { retry: retryTransactions } = useTransactions();
  const offers = useListingOffers(listing.id, onChanged);
  const [editing, setEditing] = useState<ListingOffer | "new" | null>(null);
  const [deleting, setDeleting] = useState<ListingOffer | null>(null);
  const [converting, setConverting] = useState<ListingOffer | null>(null);
  const summary = useMemo(() => ({
    negotiating: offers.offers.filter((offer) => offer.status === "negotiating" || offer.status === "countered").length,
    accepted: offers.offers.filter((offer) => offer.status === "accepted").length,
  }), [offers.offers]);

  if (offers.isLoading) return <section className="listing-tracking-panel listing-offers" aria-live="polite">Chargement des offres…</section>;
  return <section className="listing-tracking-panel listing-offers" aria-labelledby="listing-offers-title">
    <header><div><span>Propositions reçues</span><h3 id="listing-offers-title">OFFRES REÇUES</h3></div><button onClick={() => setEditing("new")} type="button">+ Ajouter une offre</button></header>
    {offers.error && <p className="listing-editor-error" role="alert">{offers.error}</p>}
    <div className="listing-offer-summary"><article><strong>{offers.offers.length}</strong><span>Total</span></article><article><strong>{summary.negotiating}</strong><span>En négociation</span></article><article><strong>{summary.accepted}</strong><span>Acceptée{summary.accepted === 1 ? "" : "s"}</span></article></div>

    {offers.transactionLink && <article className="listing-linked-transaction"><span>TRANSACTION CRÉÉE ✓</span><strong>{offers.transactionLink.transaction.price === null ? "Prix non renseigné" : formatListingAmount(offers.transactionLink.transaction.price, "sale")}</strong><small>PA du {offers.transactionLink.transaction.promiseDate ? displayDate(offers.transactionLink.transaction.promiseDate) : "—"} · {BROKER_LABELS[offers.transactionLink.transaction.broker]}</small><button onClick={() => router.push(`/transactions/${offers.transactionLink!.transactionId}`)} type="button">Ouvrir la transaction →</button></article>}

    <div className="listing-offer-list">{offers.offers.map((offer) => {
      const linked = offers.transactionLink?.offerId === offer.id;
      const consumed = offers.consumedOfferIds.includes(offer.id);
      return <article key={offer.id}><header><div><strong>{formatListingAmount(offer.amount, offer.purpose)}</strong><span className={`listing-offer-status listing-offer-status-${offer.status}`}>{LISTING_OFFER_STATUS_LABELS[offer.status]}</span></div><div><button aria-label="Modifier l’offre" onClick={() => setEditing(offer)} type="button">✎</button><button aria-label="Supprimer l’offre" className="listing-task-delete" disabled={consumed} onClick={() => setDeleting(offer)} type="button">⌫</button></div></header><p><span>Date</span>{displayDate(offer.offerDate)}</p>{offer.buyerNames && <p><span>{offer.purpose === "sale" ? "Acheteurs" : "Locataires"}</span>{offer.buyerNames}</p>}{(offer.collaboratingBrokerName || offer.collaboratingBrokerAgency) && <p><span>Courtier collaborateur</span>{[offer.collaboratingBrokerName, offer.collaboratingBrokerAgency].filter(Boolean).join(" — ")}</p>}{offer.notes && <blockquote>{offer.notes}</blockquote>}
        {offer.status === "accepted" && offer.purpose === "rental" && <strong className="listing-rental-accepted">OFFRE DE LOCATION ACCEPTÉE</strong>}
        {offer.status === "accepted" && offer.purpose === "sale" && !consumed && !offers.transactionLink && <button className="listing-create-transaction" disabled={offers.isSaving} onClick={() => setConverting(offer)} type="button">CRÉER LA TRANSACTION</button>}
        {consumed && <span className="listing-offer-linked">{linked ? "Liée à la transaction active" : "Liée à une transaction historique"}</span>}
      </article>;
    })}{offers.offers.length === 0 && <p className="listing-detail-empty">Aucune offre reçue pour le moment.</p>}</div>

    {editing && <ListingOfferModal purpose={listing.purpose} offer={editing === "new" ? null : editing} isSaving={offers.isSaving} onClose={() => setEditing(null)} onSave={async (draft) => { if (editing === "new") await offers.createOffer(draft); else await offers.updateOffer(editing.id, draft); setEditing(null); }} />}
    {deleting && <ConfirmationModal title="SUPPRIMER CETTE OFFRE ?" confirmLabel="Supprimer" destructive isSaving={offers.isSaving} onClose={() => setDeleting(null)} onConfirm={async () => { await offers.deleteOffer(deleting.id); setDeleting(null); }}><strong>{formatListingAmount(deleting.amount, deleting.purpose)}</strong><p>Cette offre sera retirée définitivement. Le Listing et ses autres données seront conservés.</p></ConfirmationModal>}
    {converting && <ConfirmationModal title="CRÉER LA TRANSACTION ?" confirmLabel="Créer la transaction" isSaving={offers.isSaving} onClose={() => setConverting(null)} onConfirm={async () => { const link = await offers.createTransaction(converting.id); await retryTransactions(); setConverting(null); router.push(`/transactions/${link.transactionId}`); }}><strong>{listingAddressLines(listing).join(", ")}</strong><p>Une transaction Vente sera créée au prix accepté de <b>{formatListingAmount(converting.amount, "sale")}</b>.</p><dl className="listing-conversion-summary"><div><dt>Courtier</dt><dd>{BROKER_LABELS[listing.broker]}</dd></div><div><dt>Propriétaires liés</dt><dd>{ownerNames.join(", ") || "Aucun"}</dd></div><div><dt>Acheteurs</dt><dd>{converting.buyerNames || "Non renseignés"}</dd></div></dl><p>Les noms d’acheteurs resteront informatifs et aucun nouveau contact ne sera créé.</p></ConfirmationModal>}
  </section>;
}
