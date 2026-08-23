"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Broker } from "../broker-context";
import type { CalendarBroker, CalendarConnectionStatus } from "../data/calendar-types";
import { BROKER_LABELS } from "../data/contact-types";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";

type ContactEmailModalProps = {
  contactId: string;
  contactName: string;
  initialTo: string;
  isOpen: boolean;
  selectedBroker: Broker | null;
  onChooseBroker: () => void;
  onClose: () => void;
  onSent: (broker: Broker) => void;
};

export function selectedBrokerToGmailBroker(selectedBroker: Broker | null): CalendarBroker | null {
  return selectedBroker ? selectedBroker.toLocaleLowerCase("fr-CA") as CalendarBroker : null;
}

export function ContactEmailModal({
  contactId,
  contactName,
  initialTo,
  isOpen,
  selectedBroker,
  onChooseBroker,
  onClose,
  onSent,
}: ContactEmailModalProps) {
  const senderBroker = selectedBrokerToGmailBroker(selectedBroker);
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<CalendarConnectionStatus | null>(null);
  const [isLoadingConnection, setIsLoadingConnection] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  useDialogLifecycle(isOpen, isSending ? () => undefined : onClose);

  useEffect(() => {
    if (!isOpen) return;
    setTo(initialTo);
    setSubject("");
    setMessage("");
    setError(null);
    setIsSending(false);
    sendingRef.current = false;
  }, [initialTo, isOpen]);

  useEffect(() => {
    if (!isOpen || !senderBroker) {
      setConnection(null);
      setIsLoadingConnection(false);
      return;
    }
    const controller = new AbortController();
    setIsLoadingConnection(true);
    fetch("/api/google-calendar/connections", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Statut Google indisponible.");
        const payload = (await response.json()) as { connections: CalendarConnectionStatus[] };
        setConnection(payload.connections.find((item) => item.broker === senderBroker) ?? null);
      })
      .catch((caughtError) => {
        if ((caughtError as Error).name !== "AbortError") setError("Impossible de vérifier l’activation Gmail.");
      })
      .finally(() => setIsLoadingConnection(false));
    return () => controller.abort();
  }, [isOpen, senderBroker]);

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBroker || !senderBroker || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    setError(null);
    try {
      // selectedBroker est volontairement l’expéditeur; contact.broker ne participe jamais à ce choix.
      const response = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderBroker, contactId, to, subject, message }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Le courriel n’a pas pu être envoyé.");
      onSent(selectedBroker);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Le courriel n’a pas pu être envoyé.");
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  if (!isOpen) return null;

  const activateUrl = senderBroker
    ? `/api/google-calendar/connect?broker=${senderBroker}&capability=gmail&returnTo=${encodeURIComponent(`/contacts/${contactId}`)}`
    : null;

  return (
    <div className="contact-modal-backdrop contact-modal-top" onMouseDown={(event) => event.target === event.currentTarget && !isSending && onClose()} role="presentation">
      <section aria-labelledby="contact-email-title" aria-modal="true" className="contact-modal contact-email-modal" role="dialog">
        <header className="contact-modal-header">
          <div><p className="section-kicker">Communication client</p><h2 id="contact-email-title">ENVOYER UN COURRIEL</h2><small>{contactName}</small></div>
          <button aria-label="Fermer" disabled={isSending} onClick={onClose} type="button">×</button>
        </header>

        {!selectedBroker ? (
          <div className="contact-email-unavailable"><h3>SÉLECTIONNEZ UN COURTIER</h3><p>Sélectionnez d’abord le courtier qui envoie ce courriel.</p><button onClick={onChooseBroker} type="button">CHOISIR UN COURTIER</button></div>
        ) : isLoadingConnection ? (
          <div className="contact-email-unavailable"><p>Vérification de Gmail…</p></div>
        ) : error && !connection ? (
          <div className="contact-email-unavailable"><h3>GMAIL INDISPONIBLE</h3><p>{error}</p></div>
        ) : !connection?.gmailSendEnabled ? (
          <div className="contact-email-unavailable"><h3>GMAIL NON ACTIVÉ</h3><p>Le compte Google de {selectedBroker} doit autoriser l’envoi de courriels.</p>{activateUrl && <button onClick={() => window.location.assign(activateUrl)} type="button">ACTIVER GMAIL</button>}</div>
        ) : !connection.gmailSignatureEnabled ? (
          <div className="contact-email-unavailable"><h3>SIGNATURE GMAIL — AUTORISATION REQUISE</h3><p>La signature Gmail doit être autorisée pour ce courtier.</p>{activateUrl && <button onClick={() => window.location.assign(activateUrl)} type="button">ACTIVER LA SIGNATURE GMAIL</button>}</div>
        ) : (
          <form className="contact-email-form" onSubmit={submitEmail}>
            <div className="contact-email-sender"><span>EXPÉDITEUR</span><strong>{BROKER_LABELS[connection.broker]}</strong><small>{connection.email}</small></div>
            <label><span>À *</span><input autoFocus autoComplete="email" onChange={(event) => setTo(event.target.value)} required type="email" value={to} /></label>
            <label><span>OBJET *</span><input maxLength={250} onChange={(event) => setSubject(event.target.value)} required value={subject} /></label>
            <label><span>MESSAGE *</span><textarea maxLength={100000} onChange={(event) => setMessage(event.target.value)} required rows={9} value={message} /></label>
            {error && <p className="contact-email-error" role="alert">{error}</p>}
            <div className="contact-email-actions"><button disabled={isSending} onClick={onClose} type="button">ANNULER</button><button disabled={isSending || !to.trim() || !subject.trim() || !message.trim()} type="submit">{isSending ? "ENVOI…" : "ENVOYER"}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
