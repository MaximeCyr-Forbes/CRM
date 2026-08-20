import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { transactionApiErrorMessage, transactionErrorMetadata } from "./api-error";

describe("erreurs fiables de l’API Transactions", () => {
  it("traduit les erreurs métier connues sans exposer les détails", () => {
    expect(transactionApiErrorMessage({ code: "23503", details: "transaction_contacts contact_id" }, "create"))
      .toBe("Un des contacts liés n’est plus disponible.");
    expect(transactionApiErrorMessage({ code: "23514", message: "transactions_status_check" }, "create"))
      .toBe("Le statut sélectionné n’est pas accepté.");
    expect(transactionApiErrorMessage({ code: "23502", message: "null value in column address" }, "create"))
      .toBe("L’adresse de la transaction est invalide.");
    expect(transactionApiErrorMessage({ code: "XX000", message: "Détail technique" }, "create"))
      .toBe("La transaction n’a pas pu être créée.");
  });

  it("prépare les métadonnées techniques uniquement pour le journal serveur", () => {
    expect(transactionErrorMetadata({ code: "23503", message: "message", details: "details", hint: "hint" }, "create"))
      .toEqual({ action: "create", code: "23503", message: "message", details: "details", hint: "hint" });
    const route = readFileSync(resolve(process.cwd(), "app/api/transactions/route.ts"), "utf8");
    expect(route).toContain('console.error("Opération transaction impossible", transactionErrorMetadata');
    expect(route).toContain("transactionApiErrorMessage(error, action)");
  });
});
