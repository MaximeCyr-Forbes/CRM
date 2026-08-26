"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import type { Listing, ListingOfferDraft } from "../data/listing-types";
import { formatListingAmount } from "../lib/listings/presentation";
import { purchaseAgreementOfferDraft } from "../lib/purchase-agreement/offer";
import type { PurchaseAgreementParseResult } from "../lib/purchase-agreement/types";
import { validatePurchaseAgreementForListing } from "../lib/purchase-agreement/validation";

type Analysis = {
  fileName: string;
  result: PurchaseAgreementParseResult;
};

type ImportState = "idle" | "loading" | "ready" | "created" | "error";

export function PurchaseAgreementImport({ listing, ownerNames, disabled, onCreateOffer }: {
  listing: Listing;
  ownerNames: string[];
  disabled: boolean;
  onCreateOffer: (offer: ListingOfferDraft) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionLock = useRef(false);
  const [state, setState] = useState<ImportState>("idle");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (listing.purpose !== "sale") return null;

  const reset = () => {
    submissionLock.current = false;
    setAnalysis(null);
    setError(null);
    setState("idle");
    setIsDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const analyze = async (file: File | undefined) => {
    if (!file || state === "loading") return;
    setAnalysis(null);
    setError(null);
    setState("loading");
    submissionLock.current = false;
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/purchase-agreements/parse", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: PurchaseAgreementParseResult;
        error?: string;
      } | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error ?? "La promesse d’achat n’a pas pu être analysée.");
      }
      setAnalysis({ fileName: file.name, result: payload.data });
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La promesse d’achat n’a pas pu être analysée.");
      setState("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const openFilePicker = () => {
    if (!disabled && state !== "loading") inputRef.current?.click();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (!disabled) void analyze(event.dataTransfer.files[0]);
  };

  const onDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  };

  const createOffer = async () => {
    if (!analysis || disabled || submissionLock.current) return;
    const validation = validatePurchaseAgreementForListing(analysis.result, listing, ownerNames);
    const draft = purchaseAgreementOfferDraft(analysis.result);
    if (!validation.canImport || !draft) return;

    submissionLock.current = true;
    setError(null);
    try {
      await onCreateOffer(draft);
      setAnalysis(null);
      setState("created");
    } catch (caught) {
      submissionLock.current = false;
      setError(caught instanceof Error ? caught.message : "L’offre n’a pas pu être ajoutée.");
    }
  };

  const validation = analysis
    ? validatePurchaseAgreementForListing(analysis.result, listing, ownerNames)
    : null;

  return <section className="purchase-agreement-import" aria-labelledby="purchase-agreement-import-title">
    <header className="purchase-agreement-heading">
      <div>
        <span className="section-kicker">Import PDF</span>
        <h4 id="purchase-agreement-import-title">DÉPOSER UNE PA</h4>
      </div>
      <p>Ajoutez une Promesse d’achat OACIQ pour préremplir une offre reçue.</p>
    </header>

    {!analysis && state !== "created" && <div
      aria-disabled={disabled || state === "loading"}
      className={`transaction-centris-dropzone${isDragging ? " is-dragging" : ""}${state === "loading" ? " is-loading" : ""}`}
      onClick={openFilePicker}
      onDragEnter={(event) => { event.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onKeyDown={onDropzoneKeyDown}
      role="button"
      tabIndex={disabled || state === "loading" ? -1 : 0}
    >
      {state === "loading" ? <>
        <span className="transaction-centris-spinner" aria-hidden="true" />
        <strong>ANALYSE EN COURS…</strong>
        <span>Lecture locale et sécurisée du formulaire PDF.</span>
      </> : <div>
        <strong>Glissez la Promesse d’achat ici</strong>
        <span>ou sélectionnez un PDF</span>
        <span className="transaction-centris-file-button">CHOISIR UN PDF</span>
      </div>}
    </div>}
    <input
      accept="application/pdf,.pdf"
      aria-label="Sélectionner une Promesse d’achat PDF"
      disabled={disabled || state === "loading"}
      hidden
      onChange={(event: ChangeEvent<HTMLInputElement>) => void analyze(event.target.files?.[0])}
      ref={inputRef}
      type="file"
    />

    {error && <div className="purchase-agreement-error" role="alert"><strong>IMPORT IMPOSSIBLE</strong><p>{error}</p><button onClick={reset} type="button">Choisir un autre PDF</button></div>}

    {analysis && validation && <div className="purchase-agreement-preview">
      <header>
        <div><strong>{analysis.result.recognized ? "PROMESSE D’ACHAT ANALYSÉE ✓" : "PROMESSE D’ACHAT NON RECONNUE"}</strong><span>{analysis.fileName}</span></div>
        <button aria-label="Retirer le PDF" onClick={reset} type="button">×</button>
      </header>
      <dl className="purchase-agreement-summary">
        <div><dt>ACHETEURS</dt><dd>{analysis.result.buyers.length > 0 ? analysis.result.buyers.map((buyer) => <span key={buyer}>{buyer}</span>) : "Non détectés"}</dd></div>
        <div><dt>VENDEUR{analysis.result.sellers.length === 1 ? "" : "S"}</dt><dd>{analysis.result.sellers.length > 0 ? analysis.result.sellers.map((seller) => <span key={seller}>{seller}</span>) : "Non détecté"}</dd></div>
        <div><dt>IMMEUBLE</dt><dd>{analysis.result.propertyAddress.fullAddress || "Non détecté"}</dd></div>
        <div><dt>PRIX OFFERT</dt><dd>{analysis.result.amount === null ? "Non détecté" : formatListingAmount(analysis.result.amount, "sale")}</dd></div>
      </dl>

      {analysis.result.recognized && validation.addressMatch && <p className="purchase-agreement-match">ADRESSE DU LISTING · CORRESPONDANCE ✓</p>}
      {analysis.result.recognized && !validation.addressMatch && <div className="purchase-agreement-warning is-blocking" role="alert"><strong>CETTE PA SEMBLE CONCERNER UN AUTRE IMMEUBLE</strong><p><b>PA :</b> {analysis.result.propertyAddress.fullAddress || "Adresse non détectée"}</p><p><b>Listing actuel :</b> {validation.listingAddress}</p></div>}
      {validation.sellerMatch === true && <p className="purchase-agreement-match">VENDEUR · CORRESPONDANCE ✓</p>}
      {validation.sellerMatch === false && <div className="purchase-agreement-warning"><strong>VENDEUR À VÉRIFIER</strong><p><b>Vendeur sur la PA :</b> {analysis.result.sellers.join(", ")}</p><p><b>Propriétaire(s) du Listing :</b> {ownerNames.join(", ")}</p></div>}
      {validation.missingFields.length > 0 && <div className="purchase-agreement-warning is-blocking"><strong>INFORMATIONS MANQUANTES</strong><ul>{validation.missingFields.map((field) => <li key={field}>{field}</li>)}</ul></div>}
      {!analysis.result.recognized && <div className="purchase-agreement-warning is-blocking"><strong>PROMESSE D’ACHAT NON RECONNUE</strong><p>Le document ne présente pas les sections OACIQ requises.</p></div>}

      <footer>
        <button onClick={reset} type="button">Retirer le PDF</button>
        <button className="purchase-agreement-submit" disabled={!validation.canImport || disabled || submissionLock.current} onClick={() => void createOffer()} type="button">{disabled || submissionLock.current ? "AJOUT EN COURS…" : "AJOUTER CETTE PA"}</button>
      </footer>
    </div>}

    {state === "created" && <div className="purchase-agreement-created" role="status"><div><strong>PA AJOUTÉE ✓</strong><span>L’offre reçue apparaît maintenant dans le suivi du Listing.</span></div><button onClick={reset} type="button">Déposer une autre PA</button></div>}
  </section>;
}
