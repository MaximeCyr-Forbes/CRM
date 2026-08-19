import { describe, expect, it } from "vitest";
import { inferBirthDateOrder, normalizeBirthDate } from "./birth-date";
import { analyzeCSVContacts } from "./contact-import-csv";
import { parseVCardContacts } from "./contact-import";

describe("dates de naissance", () => {
  it("normalise les formats permis sans objet Date local", () => {
    expect(normalizeBirthDate("1975-10-06", { today: "2026-08-19" })).toBe("1975-10-06");
    expect(normalizeBirthDate("1975/10/06", { today: "2026-08-19" })).toBe("1975-10-06");
    expect(normalizeBirthDate("06/10/1975", { today: "2026-08-19" })).toBe("1975-10-06");
    expect(normalizeBirthDate("06-10-1975", { today: "2026-08-19" })).toBe("1975-10-06");
    expect(normalizeBirthDate("06.10.1975", { today: "2026-08-19" })).toBe("1975-10-06");
    expect(inferBirthDateOrder(["03/17/1975", "04/22/1980"])).toBe("month-first");
  });

  it("accepte le vide et refuse les dates impossibles ou futures", () => {
    expect(normalizeBirthDate("", { today: "2026-08-19" })).toBe("");
    expect(normalizeBirthDate("31/02/1975", { today: "2026-08-19" })).toBe("");
    expect(normalizeBirthDate("2027-01-01", { today: "2026-08-19" })).toBe("");
  });

  it("détecte une colonne anniversaire plutôt que les dates opérationnelles", () => {
    const rows = Array.from({ length: 40 }, (_, index) => {
      const day = String(index % 27 + 1).padStart(2, "0");
      return `Prénom${index},Nom${index},${1970 + index % 25}-05-${day},2025-01-${day},contact${index}@example.ca`;
    });
    const analysis = analyzeCSVContacts(["Prénom,Nom,Date de naissance,Date de modification,Email", ...rows].join("\n"));
    expect(analysis.mapping.birthDate?.index).toBe(2);
    expect(analysis.drafts.every((draft) => /^\d{4}-05-\d{2}$/.test(draft.birthDate))).toBe(true);
  });

  it("reconnaît les aliases anglais et laisse le champ vide lorsqu’il est absent", () => {
    const birthday = analyzeCSVContacts("First Name,Last Name,Birthday\nMarie,Ève,1975-10-06");
    expect(birthday.mapping.birthDate?.source).toBe("header");
    expect(birthday.drafts[0].birthDate).toBe("1975-10-06");
    const absent = analyzeCSVContacts("First Name,Last Name,Email\nMarie,Ève,marie@example.ca");
    expect(absent.mapping.birthDate).toBeNull();
    expect(absent.drafts[0].birthDate).toBe("");
  });

  it("utilise la convention cohérente de la colonne pour une date ambiguë", () => {
    const analysis = analyzeCSVContacts("Prénom;Nom;Date anniversaire\nMarie;Ève;13/04/1975\nJean;Côté;03/04/1975");
    expect(analysis.drafts.map((draft) => draft.birthDate)).toEqual(["1975-04-13", "1975-04-03"]);
  });

  it("importe BDAY depuis une vCard", () => {
    const [contact] = parseVCardContacts("BEGIN:VCARD\nVERSION:3.0\nN:Béliveau;François;;;\nBDAY;VALUE=date:1975-10-06\nEND:VCARD");
    expect(contact.birthDate).toBe("1975-10-06");
    expect(contact.lastName).toBe("Béliveau");
  });
});
