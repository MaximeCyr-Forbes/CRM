import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SALE_TRANSACTION_STATUSES } from "../../data/transaction-types";
import {
  canCompleteTransactionSale,
  mapTransactionSaleCompletionError,
  parseTransactionSaleCompletion,
} from "./sale-completion";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("résultat de vente d’une Transaction", () => {
  it("valide et normalise les données de vente", () => {
    expect(parseTransactionSaleCompletion({
      soldPrice: 365000,
      notaryDate: "2026-08-24",
      collaboratingBrokerName: "  Jean Tremblay  ",
      noCollaboratingBroker: false,
    })).toEqual({
      soldPrice: 365000,
      notaryDate: "2026-08-24",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    });
    expect(parseTransactionSaleCompletion({
      soldPrice: 365000,
      notaryDate: "2026-08-24",
      collaboratingBrokerName: "Ignoré",
      noCollaboratingBroker: true,
    })?.collaboratingBrokerName).toBe("");
  });

  it("refuse un prix invalide, une date impossible ou un collaborateur absent", () => {
    const valid = {
      soldPrice: 365000,
      notaryDate: "2026-08-24",
      collaboratingBrokerName: "Jean Tremblay",
      noCollaboratingBroker: false,
    };
    expect(parseTransactionSaleCompletion({ ...valid, soldPrice: 0 })).toBeNull();
    expect(parseTransactionSaleCompletion({ ...valid, soldPrice: Number.NaN })).toBeNull();
    expect(parseTransactionSaleCompletion({ ...valid, notaryDate: "2026-02-30" })).toBeNull();
    expect(parseTransactionSaleCompletion({ ...valid, collaboratingBrokerName: "" })).toBeNull();
    expect(parseTransactionSaleCompletion({ ...valid, collaboratingBrokerName: "a".repeat(241) })).toBeNull();
  });

  it.each(SALE_TRANSACTION_STATUSES)(
    "autorise VENDU au statut %s tant que la vente n’est pas finalisée",
    (status) => {
      expect(canCompleteTransactionSale({ type: "sale", status, saleFinalizedAt: null })).toBe(true);
    },
  );

  it("masque VENDU pour un achat et pour une vente déjà finalisée", () => {
    expect(canCompleteTransactionSale({ type: "purchase", status: "completed", saleFinalizedAt: null })).toBe(false);
    expect(canCompleteTransactionSale({
      type: "sale",
      status: "notary",
      saleFinalizedAt: "2026-08-22T15:00:00.000Z",
    })).toBe(false);
  });

  it("traduit les erreurs métier sans exposer la réponse technique", () => {
    expect(mapTransactionSaleCompletionError({ message: "Seule une Transaction de vente peut être finalisée comme vendue." })?.message)
      .toBe("Seule une Transaction de vente peut être finalisée comme vendue.");
    expect(mapTransactionSaleCompletionError({ message: "Cette vente est déjà finalisée." })?.message)
      .toBe("Cette vente est déjà finalisée.");
    expect(mapTransactionSaleCompletionError({ message: "détail interne secret" })).toBeNull();
  });
});

describe("architecture de finalisation Transaction", () => {
  it("utilise une route dédiée protégée et une action de contexte dédiée", () => {
    const route = source("app/api/transactions/[transactionId]/complete-sale/route.ts");
    const context = source("app/transactions-context.tsx");
    expect(route).toContain("requireApiAccess()");
    expect(route).toContain("isSameOriginRequest(request)");
    expect(route).toContain("isTransactionUuid(transactionId)");
    expect(route).toContain("parseTransactionSaleCompletion(body?.values)");
    expect(route).toContain("completeTransactionSale(transactionId, values)");
    expect(context).toContain("completeSale:");
    expect(context).toContain("/complete-sale");
    expect(context).toContain("return replaceTransaction(payload.data)");
  });

  it("ne dépend plus d’une résolution Listing ou Centris pour ouvrir VENDU", () => {
    const detail = source("app/transactions/[transactionId]/page.tsx");
    expect(detail).toContain("canCompleteTransactionSale(transaction)");
    expect(detail).toContain("setIsMarkingSold(true)");
    expect(detail).not.toContain("resolveListingForSaleTransaction");
    expect(detail).not.toContain("normalizeCentrisNumber");
    expect(detail).not.toContain("LISTING INTROUVABLE");
    const modal = source("app/components/sale-completion-modal.tsx");
    expect(modal).not.toContain("../lib/listings/");
  });

  it("définit une migration additive, atomique, protégée et sans suppression", () => {
    const sql = source("supabase/migrations/20260822113000_add_transaction_sale_completion.sql");
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("add column if not exists sold_price numeric(14, 2)");
    expect(sql).toContain("add column if not exists notary_date date");
    expect(sql).toContain("add column if not exists collaborating_broker_name text not null default ''");
    expect(sql).toContain("add column if not exists sale_finalized_at timestamptz");
    expect(sql).toContain("transactions_sold_price_check");
    expect(sql).toContain("complete_transaction_sale");
    expect(sql).toContain("for update");
    expect(sql).toContain("v_transactions_before");
    expect(sql).toContain("v_transactions_after");
    expect(sql).toContain("to service_role");
    expect(sql).not.toMatch(/update\s+public\.transactions\s+set\s+status/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.transactions/i);
    expect(sql).not.toMatch(/truncate\s+(?:table\s+)?public\.transactions/i);
  });
});
