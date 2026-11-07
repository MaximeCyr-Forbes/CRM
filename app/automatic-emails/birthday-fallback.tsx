"use client";
import { useRef, useState } from "react";
import { workspaceRequest } from "../lib/workspace-request";
import type { AutomaticEmailRule } from "../data/automatic-email-types";
import type { CalendarConnectionStatus } from "../data/calendar-types";
import { CONTACT_BROKERS } from "../data/contact-types";
import "../components/birthday-greetings.css";
export function BirthdayFallback({ rule, connections, onChange }: { rule: AutomaticEmailRule; connections: CalendarConnectionStatus[]; onChange: (enabled: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(false);
  const purchase = rule.ruleType === "purchase_anniversary";
  const enabled = (purchase ? rule.triggerConfig.purchaseAnniversaryFallbackEnabled : rule.triggerConfig.birthdayFallbackEnabled) === true;
  async function toggle() {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError(null);
    try {
      const r = await workspaceRequest(purchase ? "/api/purchase-anniversary-greetings/fallback" : "/api/birthday-greetings/fallback", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Modification impossible.");
      onChange(data.enabled);
    } catch (e) { setError(e instanceof Error ? e.message : "Modification impossible."); }
    finally { guard.current = false; setBusy(false); }
  }
  return <div className="birthday-fallback"><button type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={() => void toggle()}>Envoi de secours à 17 h · {busy ? "…" : enabled ? "Activé" : "Désactivé"}</button><small>Heure du Québec. Uniquement si personne n’a envoyé le courriel ou cliqué « Fait ». Les actions manuelles restent disponibles.</small>{CONTACT_BROKERS.some(b => !connections.some(c => c.broker === b && c.gmailSendEnabled && c.gmailSignatureEnabled)) && <small>Une connexion Gmail est à vérifier dans Paramètres.</small>}{error && <p role="alert">{error}</p>}</div>;
}
