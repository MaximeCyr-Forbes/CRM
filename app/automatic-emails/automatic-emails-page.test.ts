import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { appNavigationOrder } from "../data/software-links";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("module Courriels Auto verrouillé", () => {
  it("est privé et correctement placé dans la navigation", () => {
    expect(appNavigationOrder).toEqual([
      "Accueil", "Contacts", "Listings", "Transactions", "Calendrier", "Statistiques", "Courriels Auto", "Logiciels", "Paramètres",
    ]);
    expect(source("app/components/app-header.tsx")).toContain('{ label: "Courriels Auto", href: "/automatic-emails", match: "/automatic-emails" }');
    expect(source("app/automatic-emails/layout.tsx")).toContain("PrivateRouteLayout");
  });

  it("affiche les quatre règles, le verrou et les simulations sans activation", () => {
    const page = source("app/automatic-emails/page.tsx");
    expect(page).toContain("ENVOIS AUTOMATIQUES VERROUILLÉS");
    expect(page).toContain("MODE SIMULATION");
    expect(page).toContain("SIMULATION SEULEMENT");
    expect(page).toContain("AUTOMATIC_EMAIL_RULE_LABELS");
    expect(page).not.toContain("ACTIVER LES ENVOIS");
    expect(page).not.toContain("sendGmailMessage");
    expect(page).not.toContain("messages.send");
  });

  it("ne crée aucune route capable de lancer un envoi automatique", () => {
    const apiRoot = resolve(root, "app/api/automatic-emails");
    for (const route of ["run/route.ts", "send/route.ts", "send-auto/route.ts"]) expect(() => readFileSync(resolve(apiRoot, route), "utf8")).toThrow();
    expect(source("app/api/automatic-emails/preview/route.ts")).not.toContain("sendGmailMessage");
    expect(source("app/api/automatic-emails/occurrences/route.ts")).not.toContain("sendGmailMessage");
  });

  it("bonifie la configuration et les aperçus Avis Google sans enlever le verrou", () => {
    const page = source("app/automatic-emails/page.tsx");
    for (const text of [
      "Transactions admissibles",
      "Achats + ventes",
      "Achats seulement",
      "Ventes seulement",
      "Envoyer après",
      "HEURE PRÉVUE",
      "Lien direct pour donner un avis Google",
      "TESTER LE LIEN",
      "DEMANDE D’AVIS GOOGLE",
      "Date de conclusion",
      "Envoi prévu",
      "AVIS GOOGLE",
      "BLOQUÉ",
      "PRÊT",
    ]) expect(page).toContain(text);
    expect(page).toContain("Ce choix sera utilisé seulement lorsque les envois automatiques seront activés dans une phase future.");
    expect(page).toContain("Aucun courriel ne sera envoyé.");
  });
});
