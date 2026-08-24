import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("architecture de finalisation des achats", () => {
  it("protège la route dédiée et ne renvoie jamais l’erreur Supabase brute", () => {
    const route = source("app/api/transactions/[transactionId]/complete-purchase/route.ts");
    expect(route).toContain("requireApiAccess()");
    expect(route).toContain("isSameOriginRequest(request)");
    expect(route).toContain("isTransactionUuid(transactionId)");
    expect(route).toContain("parseTransactionPurchaseCompletion");
    expect(route).toContain("Impossible de finaliser l’achat.");
    expect(route).not.toContain("details:");
  });

  it("met le Context à jour sans rechargement après le POST", () => {
    const context = source("app/transactions-context.tsx");
    expect(context).toContain("/complete-purchase");
    expect(context).toContain("return replaceTransaction(payload.data)");
  });

  it("affiche l’action verte, la modale et le résultat final sur la fiche", () => {
    const detail = source("app/transactions/[transactionId]/page.tsx");
    const modal = source("app/components/purchase-completion-modal.tsx");
    expect(detail).toContain('className="listing-sold-button"');
    expect(detail).toContain("FINALISER L’ACHAT");
    expect(detail).toContain("RÉSULTAT FINAL DE L’ACHAT");
    expect(detail).toContain("ACHAT FINALISÉ ✓");
    expect(detail).toContain("Courtier collaborateur");
    expect(detail).toContain("referenceCollaboratingBrokerName={transaction.collaboratingBrokerName}");
    expect(modal).toContain("referencePrice?.toString()");
    expect(modal).toContain('type="date"');
    expect(modal).toContain("submittingRef.current");
    expect(modal).toContain("Aucun courtier collaborateur");
    expect(modal).toContain("Indiquez le courtier collaborateur ou choisissez Aucun.");
    expect(modal).toContain("disabled={noCollaboratingBroker}");
  });

  it("expose Actives, Vendus, Terminées, les années et tous les filtres existants", () => {
    const list = source("app/transactions/page.tsx");
    expect(list.indexOf(">Actives<")).toBeLessThan(list.indexOf(">Vendus<"));
    expect(list.indexOf(">Vendus<")).toBeLessThan(list.indexOf(">Terminées<"));
    expect(list).toContain("Toutes les années");
    expect(list).toContain("FINALIZED_TRANSACTION_YEARS.map");
    expect(list).toContain("brokerFilter");
    expect(list).toContain("typeFilter");
    expect(list).toContain("transactionMatchesSearch");
  });

  it("garde la migration additive, atomique, idempotente et sans mutation des liens", () => {
    const sql = source("supabase/migrations/20260824140000_add_purchase_finalization.sql");
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("add column if not exists purchase_finalized_at timestamptz");
    expect(sql).toContain("for update");
    expect(sql).toContain("purchase_finalized_at is not null");
    expect(sql).toContain("purchase_finalized_at = now()");
    expect(sql).toContain("v_transactions_before");
    expect(sql).not.toMatch(/delete\s+from|truncate\s+table|drop\s+table/i);
    expect(sql).not.toContain("transaction_contacts");
    expect(sql).not.toMatch(/status\s*=\s*'completed'/i);
  });

  it("remplace uniquement le RPC Achat pour réutiliser le courtier collaborateur existant", () => {
    const sql = source("supabase/migrations/20260824150000_add_purchase_collaborating_broker.sql");
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("drop function if exists public.complete_transaction_purchase(uuid, numeric, date)");
    expect(sql).toContain("p_collaborating_broker_name text");
    expect(sql).toContain("collaborating_broker_name = trim(p_collaborating_broker_name)");
    expect(sql).toContain("for update");
    expect(sql).not.toMatch(/add\s+column|create\s+table|delete\s+from|truncate\s+table/i);
  });

  it("affiche le collaborateur dans l’historique Contact uniquement pour un achat finalisé", () => {
    const history = source("app/components/contact-property-history.tsx");
    expect(history).toContain('transaction.type === "purchase" && transaction.purchaseFinalizedAt && transaction.collaboratingBrokerName');
    expect(history).toContain("Courtier collaborateur");
  });
});
