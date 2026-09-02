// Synthetic fixtures only. No real client PDF, contact or identifying data.
import { document, word } from "../oaciq-reader/test-fixtures";
import type { OaciqExtractedDocument } from "../oaciq-reader/types";

export function prefillPromise(centris = false): OaciqExtractedDocument {
  const first = [word("FORMULAIRE OBLIGATOIRE - PROMESSE D'ACHAT", 40, 40), word("PA 10001", 40, 60),
    word("1. IDENTIFICATION DES PARTIES", 40, 100),
    word("Jean Tremblay", 40, 130), word("Hélène Côté", 330, 130),
    word("999 rue Acheteur", 40, 150), word("777 rue Vendeur", 330, 150),
    word("jean@example.test", 40, 170), word("514-555-0101", 330, 170),
    word("ACHETEUR 1 (nom, adresse)", 40, 200), word("VENDEUR 1 (nom, adresse)", 330, 200),
    word("Marie-Ève Noël", 40, 250), word("Louis-Philippe Richer", 330, 250),
    word("ACHETEUR 2 (nom, adresse)", 40, 300), word("VENDEUR 2 (nom, adresse)", 330, 300),
    word("2. OBJET", 40, 340), word("Courtier : Autre Courtier", 40, 380)];
  const second = [word("3. DESCRIPTION SOMMAIRE DE L'IMMEUBLE", 40, 60), word("3.1", 40, 90),
    word("123 rue Test, Ville-Test, QC, H0H 0H0", 60, 107), word("3.2 Désignation cadastrale", 40, 150),
    ...(centris ? [word("Numéro Centris : 12345678", 40, 180)] : []),
    word("4. PRIX ET ACOMPTE", 40, 220), word("4.1 PRIX D'ACHAT (450000 $)", 40, 250), word("4.2 Dépôt 20000 $", 40, 280),
    word("8.1 dans les 10 jours", 40, 330), word("9.1 documents suivants: copropriété", 40, 360), word("10. Déclarations", 40, 390),
    word("AUTRES DECLARATIONS", 40, 420), word("12.1 Vérification dans les 8 jours suivant l'acceptation", 40, 445),
    word("13. SIGNATURES", 40, 480), word("Signé le 2026-09-01 10:00:00", 40, 510),
    word("14.1 Validité de l'offre dans les 30 jours suivant l'acceptation", 40, 545),
    word("RÉPONSE DU VENDEUR", 40, 590), word("Signé le 2026-09-10 10:04:19", 40, 620),
    word("ACCUSÉ DE RÉCEPTION", 40, 660), word("Signé le 2026-09-11 10:00:00", 40, 685)];
  return { ...document("PA-test.pdf", ""), pages: [first, second].map((words) => ({ width: 612, height: 792, words, text: words.map((w) => w.text).join("\n") })) };
}
