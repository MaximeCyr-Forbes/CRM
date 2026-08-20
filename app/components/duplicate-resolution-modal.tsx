"use client";

import { useMemo, useState } from "react";
import type { ClientProvenance, Contact, ContactBroker, ContactDraft, DraftMergeSelection } from "../data/contact-types";
import { BROKER_LABELS, CLIENT_PROVENANCE_LABELS, CONTACT_BROKERS, getContactFullAddress, getContactName } from "../data/contact-types";
import { getDefaultDraftMergeSources, mergeContactDraftFields, type DraftMergeSources } from "../lib/contact-merge";
import {
  addressInputFromDraft,
  fallbackAddresses,
  mergeAddressCollections,
  normalizeAddressKey,
  primaryAddressFields,
  setPrimaryAddress,
} from "../lib/contact-addresses";
import type { DuplicateReason } from "../lib/contact-normalization";
import { formatFollowUpDate } from "../lib/follow-up";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
import { formatBirthDate } from "../lib/birth-date";
import { formatMortgageRenewalDate } from "../lib/mortgage-renewal-date";

type IncomingContact = ContactDraft & {
  broker: ContactBroker;
  clientProvenance: ClientProvenance;
  nextFollowUpDate?: string | null;
};

type Props = {
  existing: Contact;
  incoming: IncomingContact;
  reasons: DuplicateReason[];
  existingNotesCount: number;
  incomingNotesCount?: number;
  isSaving: boolean;
  onCancel: () => void;
  onKeepBoth: () => void | Promise<void>;
  onMerge: (values: DraftMergeSelection) => void | Promise<void>;
};

const reasonLabels: Record<DuplicateReason, string> = {
  phone: "même téléphone",
  email: "même email",
  name: "même nom",
};

export function DuplicateResolutionModal({
  existing,
  incoming,
  reasons,
  existingNotesCount,
  incomingNotesCount = 0,
  isSaving,
  onCancel,
  onKeepBoth,
  onMerge,
}: Props) {
  const [phase, setPhase] = useState<"compare" | "merge">("compare");
  const [sources, setSources] = useState<DraftMergeSources>(() => getDefaultDraftMergeSources(existing));
  const availableAddresses = useMemo(() => mergeAddressCollections(
    fallbackAddresses(existing),
    [addressInputFromDraft(incoming, { isPrimary: false })].filter((item) => item !== null),
  ), [existing, incoming]);
  const [keptAddressKeys, setKeptAddressKeys] = useState<Set<string>>(
    () => new Set(availableAddresses.map(normalizeAddressKey)),
  );
  const defaultPrimary = availableAddresses.find((address) => address.isPrimary) ?? availableAddresses[0];
  const [primaryAddressKey, setPrimaryAddressKey] = useState(() => defaultPrimary ? normalizeAddressKey(defaultPrimary) : "");
  const [broker, setBroker] = useState<ContactBroker | null>(
    existing.broker === incoming.broker ? existing.broker : null,
  );
  const [clientProvenance, setClientProvenance] = useState<ClientProvenance | undefined>(
    existing.clientProvenance === incoming.clientProvenance ? existing.clientProvenance : undefined,
  );
  const incomingFollowUp = incoming.nextFollowUpDate ?? null;
  const [followUpSource, setFollowUpSource] = useState<"existing" | "incoming">(
    existing.nextFollowUpDate ? "existing" : "incoming",
  );
  useDialogLifecycle(true, onCancel);

  const selection = useMemo<DraftMergeSelection | null>(() => {
    if (!broker || clientProvenance === undefined) return null;
    const mergedDraft = mergeContactDraftFields(existing, incoming, sources);
    const selectedAddresses = setPrimaryAddress(
      availableAddresses.filter((address) => keptAddressKeys.has(normalizeAddressKey(address))),
      primaryAddressKey,
    );
    return {
      ...mergedDraft,
      ...primaryAddressFields(selectedAddresses),
      broker,
      clientProvenance,
      addresses: selectedAddresses,
      nextFollowUpDate:
        followUpSource === "existing" ? existing.nextFollowUpDate : incomingFollowUp,
    };
  }, [availableAddresses, broker, clientProvenance, existing, followUpSource, incoming, incomingFollowUp, keptAddressKeys, primaryAddressKey, sources]);

  const rows: Array<{ key: keyof ContactDraft; label: string }> = [
    { key: "firstName", label: "Prénom" },
    { key: "lastName", label: "Nom" },
    { key: "phone", label: "Téléphone" },
    { key: "email", label: "Email" },
    { key: "birthDate", label: "Date de naissance" },
    { key: "mortgageRenewalDate", label: "Renouvellement hypothécaire" },
  ];

  return (
    <div className="contact-modal-backdrop contact-modal-top" onMouseDown={(event) => event.target === event.currentTarget && onCancel()} role="presentation">
      <section aria-modal="true" className="contact-modal duplicate-modal" role="dialog">
        <header className="contact-modal-header">
          <div>
            <p className="section-kicker">DOUBLON POSSIBLE</p>
            <h2>{phase === "compare" ? "Vérifier avant l’ajout" : "Choisir les informations à conserver"}</h2>
            <small>{reasons.map((reason) => reasonLabels[reason]).join(" · ")} · {reasons.includes("email") || reasons.includes("phone") ? "DOUBLON FORT" : "VÉRIFICATION HUMAINE REQUISE"}</small>
          </div>
          <button aria-label="Fermer" onClick={onCancel} type="button">×</button>
        </header>

        {phase === "compare" ? (
          <>
            <div className="duplicate-comparison">
              <DuplicateCard
                broker={existing.broker}
                email={existing.email}
                label="CONTACT EXISTANT"
                name={getContactName(existing)}
                notes={`${existingNotesCount} note${existingNotesCount > 1 ? "s" : ""}`}
                phone={existing.phone}
                address={getContactFullAddress(existing)}
                followUp={existing.nextFollowUpDate}
              />
              <DuplicateCard
                broker={incoming.broker}
                email={incoming.email}
                label="NOUVEAU CONTACT"
                name={getContactName(incoming)}
                notes={`${incomingNotesCount} note${incomingNotesCount > 1 ? "s" : ""}`}
                phone={incoming.phone}
                address={getContactFullAddress(incoming)}
                followUp={incomingFollowUp}
              />
            </div>
            <div className="duplicate-actions">
              <button disabled={isSaving} onClick={() => void onKeepBoth()} type="button">CONSERVER LES DEUX</button>
              <button className="duplicate-merge-primary" onClick={() => setPhase("merge")} type="button">FUSIONNER</button>
              <button disabled={isSaving} onClick={onCancel} type="button">ANNULER L’AJOUT</button>
            </div>
          </>
        ) : (
          <div className="merge-fields">
            {rows.map(({ key, label }) => (
              <div className="merge-field-row" key={key}>
                <strong>{label}</strong>
                <button className={sources[key] === "existing" ? "merge-choice-active" : ""} onClick={() => setSources((current) => ({ ...current, [key]: "existing" }))} type="button">
                  <span>Existant</span>{key === "birthDate" ? formatBirthDate(existing[key]) : key === "mortgageRenewalDate" ? formatMortgageRenewalDate(existing[key]) : existing[key] || "Vide"}
                </button>
                <button className={sources[key] === "incoming" ? "merge-choice-active" : ""} onClick={() => setSources((current) => ({ ...current, [key]: "incoming" }))} type="button">
                  <span>Nouveau</span>{key === "birthDate" ? formatBirthDate(incoming[key]) : key === "mortgageRenewalDate" ? formatMortgageRenewalDate(incoming[key]) : incoming[key] || "Vide"}
                </button>
              </div>
            ))}

            <div className="merge-field-row">
              <strong>Provenance du client</strong>
              <button className={clientProvenance !== undefined && clientProvenance === existing.clientProvenance ? "merge-choice-active" : ""} onClick={() => setClientProvenance(existing.clientProvenance)} type="button">
                <span>Existant</span>{existing.clientProvenance ? CLIENT_PROVENANCE_LABELS[existing.clientProvenance] : "Non renseignée"}
              </button>
              <button className={clientProvenance !== undefined && clientProvenance === incoming.clientProvenance ? "merge-choice-active" : ""} onClick={() => setClientProvenance(incoming.clientProvenance)} type="button">
                <span>Nouveau</span>{incoming.clientProvenance ? CLIENT_PROVENANCE_LABELS[incoming.clientProvenance] : "Non renseignée"}
              </button>
            </div>

            <section className="merge-addresses" aria-labelledby="merge-addresses-title">
              <div className="merge-addresses-heading">
                <strong id="merge-addresses-title">ADRESSES À CONSERVER</strong>
                <button onClick={() => setKeptAddressKeys(new Set(availableAddresses.map(normalizeAddressKey)))} type="button">CONSERVER TOUTES LES ADRESSES</button>
              </div>
              {availableAddresses.length === 0 && <p>Aucune adresse structurée.</p>}
              {availableAddresses.map((address) => {
                const key = normalizeAddressKey(address);
                const kept = keptAddressKeys.has(key);
                return (
                  <div className="merge-address-option" key={key}>
                    <label>
                      <input checked={kept} onChange={(event) => {
                        const next = new Set(keptAddressKeys);
                        if (event.target.checked) next.add(key); else next.delete(key);
                        setKeptAddressKeys(next);
                        if (!event.target.checked && primaryAddressKey === key) {
                          setPrimaryAddressKey([...next][0] ?? "");
                        }
                      }} type="checkbox" />
                      <span>{getContactFullAddress(address)}</span>
                    </label>
                    <label className="merge-primary-choice">
                      <input checked={kept && primaryAddressKey === key} disabled={!kept} name="primary-address" onChange={() => setPrimaryAddressKey(key)} type="radio" />
                      ADRESSE PRINCIPALE
                    </label>
                  </div>
                );
              })}
            </section>

            <div className="merge-required-choice">
              <strong>À QUI ATTRIBUER CE CONTACT ?</strong>
              <div>
                {CONTACT_BROKERS.map((item) => (
                  <button className={broker === item ? "merge-choice-active" : ""} key={item} onClick={() => setBroker(item)} type="button">
                    {BROKER_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>

            {existing.nextFollowUpDate && incomingFollowUp && (
              <div className="merge-required-choice">
                <strong>CONSERVER UNE SEULE RELANCE</strong>
                <div>
                  <button className={followUpSource === "existing" ? "merge-choice-active" : ""} onClick={() => setFollowUpSource("existing")} type="button">CONTACT EXISTANT · {formatFollowUpDate(existing.nextFollowUpDate)}</button>
                  <button className={followUpSource === "incoming" ? "merge-choice-active" : ""} onClick={() => setFollowUpSource("incoming")} type="button">NOUVEAU CONTACT · {formatFollowUpDate(incomingFollowUp)}</button>
                </div>
              </div>
            )}

            <div className="merge-footer">
              <button onClick={() => setPhase("compare")} type="button">Retour</button>
              <button className="duplicate-merge-primary" disabled={!selection || isSaving} onClick={() => selection && void onMerge(selection)} type="button">
                {isSaving ? "FUSION…" : "CONFIRMER LA FUSION"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DuplicateCard(props: {
  label: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  broker: ContactBroker;
  notes: string;
  followUp: string | null;
}) {
  return (
    <article className="duplicate-card">
      <p>{props.label}</p>
      <h3>{props.name}</h3>
      <dl>
        <div><dt>Téléphone</dt><dd>{props.phone || "Non renseigné"}</dd></div>
        <div><dt>Email</dt><dd>{props.email || "Non renseigné"}</dd></div>
        <div><dt>Adresse</dt><dd>{props.address || "Non renseignée"}</dd></div>
        <div><dt>Courtier</dt><dd>{BROKER_LABELS[props.broker]}</dd></div>
        <div><dt>Notes</dt><dd>{props.notes}</dd></div>
        <div><dt>Prochaine relance</dt><dd>{props.followUp ? formatFollowUpDate(props.followUp) : "Aucune"}</dd></div>
      </dl>
    </article>
  );
}
