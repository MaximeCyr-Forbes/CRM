"use client";
import { useEffect, useRef, useState } from "react";
import { BROKER_LABELS } from "../data/contact-types";
import type { CalendarBroker } from "../data/calendar-types";
import { workspaceRequest } from "../lib/workspace-request";
import { useDialogLifecycle } from "../lib/use-dialog-lifecycle";
import "./birthday-greetings.css";
type Detail = { address: string; purchaseDate: string; name: string; broker: CalendarBroker | null; unassigned: boolean; canSend: boolean; canDone: boolean; reason: string | null; previousError: string | null };
export function PurchaseAnniversaryModal({ transactionId, contactId, onClose, onResolved }: { transactionId: string; contactId: string; onClose: () => void; onResolved: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  useDialogLifecycle(true, () => { if (!guard.current) onClose(); });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/purchase-anniversary-greetings/${transactionId}/${contactId}`, { cache: "no-store", signal: controller.signal })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d as Detail; })
      .then(setDetail).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { controller.abort(); previous?.focus(); };
  }, [contactId, transactionId]);
  async function act(action: "done" | "send") {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError(null);
    try {
      const r = await workspaceRequest(`/api/purchase-anniversary-greetings/${transactionId}/${contactId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Anniversaire déjà traité ou en cours d’envoi. Actualisez son état.");
      onResolved();
    } catch (e) { setError(e instanceof Error ? e.message : "Action impossible."); }
    finally { guard.current = false; setBusy(false); }
  }
  return <div className="birthday-backdrop"><div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="birthday-title" className="birthday-dialog" onKeyDown={e => {
    if (e.key !== "Tab") return;
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    if (!buttons?.length) { e.preventDefault(); return; }
    if (e.shiftKey && (document.activeElement === buttons[0] || document.activeElement === dialog.current)) { e.preventDefault(); buttons[buttons.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0].focus(); }
  }}>
    <p className="section-kicker">Une attention personnelle</p><h2 id="birthday-title">ANNIVERSAIRE D’ACHAT</h2>
    {detail ? <><h3>{detail.name}</h3><p>{detail.address}</p><p>Date d’achat : {detail.purchaseDate}</p><p>{detail.unassigned ? "Expéditeur par défaut" : "Courtier"} : <strong>{detail.broker ? BROKER_LABELS[detail.broker] : "À configurer"}</strong></p>{detail.reason && <p role="status">{detail.reason}</p>}{detail.previousError && detail.previousError !== detail.reason && <p>{detail.previousError}</p>}</> : !error && <p role="status">Vérification de l’anniversaire et de Gmail…</p>}
    {error && <p role="alert" className="birthday-error">{error}</p>}
    <div className="birthday-buttons"><button className="birthday-send" disabled={busy || !detail?.canSend} onClick={() => void act("send")} type="button">{busy ? "TRAITEMENT…" : "ENVOYER LE COURRIEL"}</button><button disabled={busy || !detail?.canDone} onClick={() => void act("done")} type="button">FAIT</button><button disabled={busy} onClick={onClose} type="button">ANNULER</button></div>
    <small>« Fait » retire la notification sans envoyer de courriel.</small>
  </div></div>;
}
