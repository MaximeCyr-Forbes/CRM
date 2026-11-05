import { describe, expect, it } from "vitest";
import { createReportFixture } from "../reports/report-test-fixtures";
import { createEmptyEmailDraft, isEmailContentModified, updateEmailDraftPreparer } from "./draft";
import { generateEmailDraft } from "./generator";
import { formatEmailBodyForClipboard, formatEmailForClipboard } from "./sharing";

const RECIPIENT = { firstName: "Élodie", lastName: "Côté", email: "elodie@example.com" };

describe("générateur de courriel ACM", () => {
  it("génère l’objet avec l’adresse et la ville", () => {
    const draft = generateEmailDraft(createReportFixture(), RECIPIENT, new Date("2026-08-29T18:00:00Z"));
    expect(draft.subject).toBe("Analyse comparative de marché – 373 4e Avenue, Deux-Montagnes");
    expect(draft.generatedAt).toBe("2026-08-29T18:00:00.000Z");
    expect(draft.preparedBy).toBe("maxime");
  });

  it("salue le client par son prénom sans inventer son nom", () => {
    expect(generateEmailDraft(createReportFixture(), RECIPIENT).body).toMatch(/^Bonjour Élodie,/);
  });

  it("utilise une salutation neutre sans prénom", () => {
    const recipient = { firstName: "", lastName: "Côté", email: "" };
    expect(generateEmailDraft(createReportFixture(), recipient).body).toMatch(/^Bonjour,\n/);
  });

  it("présente la fourchette complète", () => {
    const body = generateEmailDraft(createReportFixture(), RECIPIENT).body;
    expect(body).toContain("625 000 $ à 650 000 $");
  });

  it("omet la phrase de recommandation lorsqu’elle est absente", () => {
    const report = createReportFixture();
    report.opinion.recommendedValue = undefined;
    const body = generateEmailDraft(report, RECIPIENT).body;
    expect(body).not.toContain("la valeur recommandée se situe autour de");
    expect(body).toContain("625 000 $ à 650 000 $");
  });

  it("omet un commentaire absent sans paragraphe artificiel", () => {
    const body = generateEmailDraft(createReportFixture({ withoutComment: true }), RECIPIENT).body;
    expect(body).not.toContain("Opinion rédigée");
    expect(body).not.toContain("\n\n\n");
  });

  it("conserve le commentaire du courtier lorsqu’il est présent", () => {
    const body = generateEmailDraft(createReportFixture(), RECIPIENT).body;
    expect(body).toContain("Opinion rédigée manuellement par le courtier.");
  });

  it("indique le nombre exact de comparables inclus", () => {
    const body = generateEmailDraft(createReportFixture({ comparableCount: 3 }), RECIPIENT).body;
    expect(body).toContain("3 propriétés comparables sélectionnées");
  });

  it("prépare la copie complète et la copie du corps", () => {
    const draft = generateEmailDraft(createReportFixture(), RECIPIENT);
    expect(formatEmailForClipboard(draft)).toBe(`Objet : ${draft.subject}\n\n${draft.body}`);
    expect(formatEmailBodyForClipboard(draft)).toBe(draft.body);
  });

  it("détecte une modification manuelle de l’objet ou du corps", () => {
    const draft = generateEmailDraft(createReportFixture(), RECIPIENT);
    expect(isEmailContentModified(draft, draft.subject, draft.body)).toBe(false);
    expect(isEmailContentModified(draft, `${draft.subject} – révisée`, draft.body)).toBe(true);
    expect(isEmailContentModified(draft, draft.subject, `${draft.body}\nMerci.`)).toBe(true);
  });

  it("préserve les caractères français et initialise un brouillon vide", () => {
    const draft = generateEmailDraft(createReportFixture({ comparableCount: 2 }), RECIPIENT);
    expect(draft.body).toContain("propriétés comparables sélectionnées");
    expect(draft.body).toContain("Équipe Forbes Team");
    expect(createEmptyEmailDraft()).toMatchObject({ subject: "", body: "", editedManually: false, template: "standard" });
  });

  it.each([
    ["maxime", "Maxime Cyr"],
    ["sandrine", "Sandrine"],
    ["france", "France"],
  ] as const)("utilise uniquement la signature du préparateur %s", (preparedBy, expectedName) => {
    const report = createReportFixture();
    report.preparedBy = preparedBy;
    const body = generateEmailDraft(report, RECIPIENT).body;
    expect(body).toContain(expectedName);
    if (preparedBy !== "maxime") {
      expect(body).not.toContain("Maxime Cyr");
      expect(body).not.toContain("maxime@equipeforbesteam.com");
    }
  });

  it("met à jour uniquement la signature du préparateur dans un courriel déjà généré", () => {
    const original = generateEmailDraft(createReportFixture(), RECIPIENT);
    const edited = { ...original, body: `Note personnalisée.\n\n${original.body}`, editedManually: true };
    const updated = updateEmailDraftPreparer(edited, "sandrine");
    expect(updated.body).toContain("Note personnalisée.");
    expect(updated.body).toContain("Sandrine\nÉquipe Forbes Team");
    expect(updated.body).not.toContain("Maxime Cyr");
    expect(updated.editedManually).toBe(true);
  });
});
