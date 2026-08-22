"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  Listing,
  ListingAcceptedPaInput,
  ListingOffer,
} from "../data/listing-types";
import { useListingOffers } from "../lib/listings/use-listing-offers";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
import { useTransactions } from "../transactions-context";

const money = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function PaAcceptedModal({
  acceptedOffers,
  address,
  askingPrice,
  isSaving,
  onClose,
  onConfirm,
}: {
  acceptedOffers: ListingOffer[];
  address: string;
  askingPrice: number | null;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (values: ListingAcceptedPaInput) => Promise<void>;
}) {
  const initialOffer = acceptedOffers.length === 1 ? acceptedOffers[0] : null;
  const [selectedOfferId, setSelectedOfferId] = useState(initialOffer?.id ?? "");
  const [amount, setAmount] = useState(initialOffer?.amount.toString() ?? askingPrice?.toString() ?? "");
  const [offerDate, setOfferDate] = useState(initialOffer?.offerDate ?? "");
  const [buyerNames, setBuyerNames] = useState(initialOffer?.buyerNames ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLock = useRef(false);
  const busy = isSaving || isSubmitting;
  const selectedOffer = acceptedOffers.find((offer) => offer.id === selectedOfferId) ?? null;
  const reusesAcceptedOffer = selectedOffer !== null;
  const closeIfIdle = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useDialogLifecycle(true, closeIfIdle);

  function selectOffer(offerId: string) {
    setSelectedOfferId(offerId);
    const offer = acceptedOffers.find((item) => item.id === offerId);
    if (!offer) {
      setAmount("");
      setOfferDate("");
      setBuyerNames("");
      return;
    }
    setAmount(offer.amount.toString());
    setOfferDate(offer.offerDate);
    setBuyerNames(offer.buyerNames);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submissionLock.current) return;
    submissionLock.current = true;
    setError(null);
    const parsedAmount = Number(amount);
    if (acceptedOffers.length > 1 && !selectedOffer) {
      setError("Choisissez l’offre acceptée à utiliser.");
      submissionLock.current = false;
      return;
    }
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Prix accepté invalide.");
      submissionLock.current = false;
      return;
    }
    if (!validCalendarDate(offerDate)) {
      setError("Date de la PA requise.");
      submissionLock.current = false;
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        offerId: selectedOffer?.id ?? null,
        amount: parsedAmount,
        offerDate,
        buyerNames: buyerNames.trim(),
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Création de la Transaction impossible.");
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="listing-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeIfIdle()} role="presentation">
      <section aria-labelledby="listing-pa-accepted-title" aria-modal="true" className="listing-pa-accepted-modal" role="dialog">
        <header className="listing-editor-heading">
          <div><p className="section-kicker">Bascule vers Transactions</p><h2 id="listing-pa-accepted-title">PA ACCEPTÉE</h2><p>{address}</p></div>
          <button aria-label="Fermer" disabled={busy} onClick={closeIfIdle} type="button">×</button>
        </header>
        <form className="listing-pa-accepted-form" noValidate onSubmit={submit}>
          <p className="listing-pa-accepted-intro">Confirmez les informations de la promesse d’achat acceptée.</p>
          {acceptedOffers.length > 1 && <label className="listing-pa-accepted-wide"><span>Offre acceptée *</span><select autoFocus onChange={(event) => selectOffer(event.target.value)} required value={selectedOfferId}><option value="">Choisir une offre</option>{acceptedOffers.map((offer) => <option key={offer.id} value={offer.id}>{money.format(offer.amount)} · {offer.offerDate}{offer.buyerNames ? ` · ${offer.buyerNames}` : ""}</option>)}</select></label>}
          {acceptedOffers.length === 1 && <p className="listing-pa-existing-offer">L’offre acceptée existante sera réutilisée; aucune deuxième offre ne sera créée.</p>}
          <label><span>Prix accepté *</span><input autoFocus={acceptedOffers.length <= 1} min="0.01" onChange={(event) => setAmount(event.target.value)} readOnly={reusesAcceptedOffer} required step="0.01" type="number" value={amount} /></label>
          <label><span>Date de la PA *</span><input onChange={(event) => setOfferDate(event.target.value)} readOnly={reusesAcceptedOffer} required type="date" value={offerDate} /></label>
          <label className="listing-pa-accepted-wide"><span>Acheteur(s)</span><input onChange={(event) => setBuyerNames(event.target.value)} placeholder="Jean Tremblay et Marie Gagnon" readOnly={reusesAcceptedOffer} type="text" value={buyerNames} /></label>
          {error && <p className="listing-editor-error listing-pa-accepted-wide" role="alert">{error}</p>}
          <footer className="listing-pa-accepted-actions listing-pa-accepted-wide"><button disabled={busy} onClick={closeIfIdle} type="button">Annuler</button><button aria-busy={busy} className="listing-editor-submit" disabled={busy} type="submit">{busy ? "CRÉATION…" : "CRÉER LA TRANSACTION"}</button></footer>
        </form>
      </section>
    </div>
  );
}

export function ListingPaAcceptedAction({
  listing,
  onListingChanged,
}: {
  listing: Listing;
  onListingChanged: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { retry: retryTransactions } = useTransactions();
  const offers = useListingOffers(listing.id, onListingChanged);
  const [isOpen, setIsOpen] = useState(false);
  const acceptedOffers = useMemo(
    () => offers.offers.filter((offer) => offer.purpose === "sale"
      && offer.status === "accepted"
      && !offers.consumedOfferIds.includes(offer.id)),
    [offers.consumedOfferIds, offers.offers],
  );

  if (listing.purpose !== "sale" || offers.isLoading) return null;
  if (offers.transactionLink) {
    return <button onClick={() => router.push(`/transactions/${offers.transactionLink!.transactionId}`)} type="button">OUVRIR LA TRANSACTION</button>;
  }

  return <>
    <button className="listing-accepted-pa-button" disabled={offers.isSaving || Boolean(offers.error)} onClick={() => setIsOpen(true)} type="button">PA ACCEPTÉE</button>
    {isOpen && <PaAcceptedModal
      acceptedOffers={acceptedOffers}
      address={[listing.civicNumber, listing.address].filter(Boolean).join(" ") || listing.address}
      askingPrice={listing.askingPrice}
      isSaving={offers.isSaving}
      onClose={() => setIsOpen(false)}
      onConfirm={async (values) => {
        const link = await offers.acceptPa(values);
        await retryTransactions();
        router.push(`/transactions/${link.transactionId}`);
      }}
    />}
  </>;
}
