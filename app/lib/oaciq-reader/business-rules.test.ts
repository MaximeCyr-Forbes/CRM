import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeExtractedOaciqDocuments as analyze } from "./parser";
import { annexF, counter, document, promise, word } from "./test-fixtures";
import { clauseAmount, parseBonification } from "./price";
import { extractOaciqPdf } from "./pdf";
import { formNumber, parseCounterProposal } from "./forms";
import {
  parseAgendaDeadlines,
  proposalsFromAnalysis,
} from "../transactions/oaciq-agenda";

export function pricedPA(amount = 450000, cp = false) {
  const pa = promise({
    financing: 0,
    date: "2026-09-10",
    ...(cp ? { counter: "20002" } : {}),
  });
  pa.pages[0].text = pa.pages[0].text.replace(
    "6.2",
    `4.1 PRIX D'ACHAT (${amount} $)\n4.2 Dépôt 20000 $\n6.2`,
  );
  return pa;
}
export function bo(
  amount = 475000,
  number = "60006",
  target = "10001",
  signed = "2026-09-02",
) {
  return document(
    "upload-" + number + ".pdf",
    `BONIFICATIONS AVANT ACCEPTATION\nB1. IDENTIFICATION DU FORMULAIRE PRINCIPAL\nPromesse d'achat PA ${target}\nB2. BONIFICATION\nB2.1 PRIX D'ACHAT Le prix prévu à 4.1 est augmenté à (${amount} $)\nB2.2 AUTRES\nB3. Signatures\nSigné le ${signed} 10:00:00\nBO ${number}`,
  );
}
export function pricedCP(
  amount: number | null = 500000,
  opts: Parameters<typeof counter>[0] = {},
) {
  const cp = counter({ accepted: "2026-09-12T10:00:00-04:00", ...opts });
  cp.pages[0].words.push(word("P2.3.1", 40, 248));
  if (amount != null)
    cp.pages[0].words.push(word(String(amount), 150, 260), word("$", 205, 260));
  cp.pages[0].text = cp.pages[0].text.replace(
    "P2.3.2",
    `P2.3.1 PRIX D'ACHAT ${amount ?? ""}${amount == null ? "" : " $"}\nP2.3.2`,
  );
  return cp;
}
function fiveDayAF() {
  const af = annexF();
  af.pages[0].text = af.pages[0].text.replace("12 jours", "5 jours");
  af.pages[0].words = af.pages[0].words.map((w) =>
    w.text === "12" ? { ...w, text: "5" } : w,
  );
  return af;
}

describe("règles métier demandées : 12.1 / 14.1 / acceptation / prix", () => {
  it.each([3, 8, 17])(
    "lit réellement le délai %i de 12.1 sans absorber 14.1",
    (days) => {
      const pa = promise({
        clause12: `Vérification dans les ${days} jours suivant l'acceptation`,
      });
      pa.pages[0].text +=
        "\n14.1 Validité de l'offre dans les 30 jours suivant l'acceptation";
      const result = analyze([pa]);
      expect(
        result.deadlines.find((d) => d.sourceSection === "12.1")?.days,
      ).toBe(days);
      expect(result.deadlines.some((d) => d.sourceSection === "14.1")).toBe(
        false,
      );
    },
  );
  it("12.1 vide suivie directement de 14.1 ne récupère pas son délai", () => {
    const pa = promise();
    pa.pages[0].text +=
      "\nAUTRES DÉCLARATIONS\n12.1\n14.1 dans les 30 jours suivant l'acceptation";
    expect(
      analyze([pa]).deadlines.some(
        (d) => d.sourceSection === "12.1" || d.sourceSection === "14.1",
      ),
    ).toBe(false);
  });
  it("la normalisation et les données agenda refusent 14.1 mais autorisent 12.1.2", () => {
    const result = analyze([promise()]);
    result.deadlines = [
      { ...result.deadlines[0], sourceSection: "14.1" },
      { ...result.deadlines[0], sourceSection: "12.1.2" },
    ];
    const proposals = proposalsFromAnalysis(result);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].source.section).toBe("12.1.2");
    expect(
      parseAgendaDeadlines([
        {
          ...proposals[0],
          source: { ...proposals[0].source, section: "14.1" },
        },
      ]),
    ).toBeNull();
  });
  it("F2.1 = acceptation PA + 5, confiance élevée", () => {
    const d = analyze([pricedPA(), fiveDayAF()]).deadlines.find(
      (d) => d.sourceSection === "F2.1",
    )!;
    expect(d.dueDate).toBe("2026-09-15");
    expect(d.baseDate).toBe("2026-09-10");
    expect(d.confidence).toBe("high");
  });
  it("F2.1 = acceptation CP finale + 5, indépendant de l’upload", () => {
    const docs = [pricedPA(450000, true), fiveDayAF(), pricedCP(null)];
    for (const list of [docs, [...docs].reverse()])
      expect(
        analyze(list).deadlines.find((d) => d.sourceSection === "F2.1")
          ?.dueDate,
      ).toBe("2026-09-17");
  });
  it("CP refusée / non acceptée ne donne pas de date de référence", () => {
    const cp = pricedCP(null, { refused: true });
    const result = analyze([pricedPA(450000, true), cp, fiveDayAF()]);
    expect(result.acceptanceDateTime).toBeNull();
    expect(
      result.deadlines.find((d) => d.sourceSection === "F2.1")?.dueDate,
    ).toBeNull();
  });
  it("accepte la date de signature visible d’une CP aplatie", () => {
    const cp = pricedCP();
    cp.signatures = [];
    cp.pages[0].text = cp.pages[0].text.replace(
      "ACCUSÉ DE RÉCEPTION",
      "Signé le 2026-09-04 10:00:00\nACCUSÉ DE RÉCEPTION\nSigné le 2026-09-20 10:00:00",
    );
    expect(
      analyze([pricedPA(450000, true), cp, fiveDayAF()]).deadlines.find(
        (d) => d.sourceSection === "F2.1",
      )?.dueDate,
    ).toBe("2026-09-09");
  });
  it("une référence P2.1 aplatie ne devient pas le numéro propre de la CP", () => {
    const cp = pricedCP();
    cp.pages[0].words = cp.pages[0].words.filter((w) => !/^\d$/.test(w.text));
    cp.pages[0].words.push(word("10001", 390, 220));
    expect(parseCounterProposal(cp).targetFormNumber).toBe("10001");
    cp.pages[0].words = [];
    expect(parseCounterProposal(cp).targetFormNumber).toBe("10001");
  });
  it("sans acceptation PA/CP, une signature BO ne remplit aucune date relative", () => {
    const pa = promise({ accepted: false, financing: 0 });
    const result = analyze([pa, bo(), fiveDayAF()]);
    expect(result.acceptanceDateTime).toBeNull();
    expect(
      result.deadlines.find((d) => d.sourceSection === "F2.1")?.dueDate,
    ).toBeNull();
    expect(result.warnings.join(" ")).toContain("acceptation");
  });
  it.each([
    ["PA", 450000, () => [pricedPA()]],
    ["PA BO", 475000, () => [pricedPA(), bo()]],
    ["PA CP", 500000, () => [pricedPA(450000, true), pricedCP()]],
    ["PA BO CP", 500000, () => [pricedPA(450000, true), bo(), pricedCP()]],
    ["CP sans prix", 450000, () => [pricedPA(450000, true), pricedCP(null)]],
    [
      "BO CP sans prix",
      475000,
      () => [pricedPA(450000, true), bo(), pricedCP(null)],
    ],
  ] as const)("prix %s = %i", (_label, expected, make) => {
    const docs = make();
    for (const list of [docs, [...docs].reverse(), [...docs.slice(1), docs[0]]])
      expect(analyze(list).finalPrice).toBe(expected);
  });
  it("conserve le prix explicite d’une CP antérieure dans la chaîne acceptée", () => {
    const pa = pricedPA(450000, true);
    pa.annotations[1].text = "20001";
    expect(
      analyze([
        pa,
        pricedCP(490000, { number: "20001", next: "20002" }),
        pricedCP(null, { target: "20001" }),
      ]).finalPrice,
    ).toBe(490000);
  });
  it("la chronologie BO/CP compte, pas une priorité absolue CP > BO", () => {
    const pa = pricedPA(450000, true);
    pa.annotations[1].text = "20001";
    const initialCP = pricedCP(490000, {
      number: "20001",
      next: "20002",
      accepted: "2026-09-01T10:00:00-04:00",
    });
    const finalCP = pricedCP(null, { target: "20001" });
    const docs = [pa, initialCP, bo(), finalCP];
    expect(analyze(docs).finalPrice).toBe(475000);
    expect(analyze([...docs].reverse()).finalPrice).toBe(475000);
  });
  it("ne prend ni financement, ni dépôt, ni offre CP refusée/non reliée", () => {
    const pa = pricedPA();
    pa.pages[0].text += "\nEmprunt : 999000 $\nDépôt : 10000 $";
    expect(
      analyze([pa, pricedCP(900000, { target: "99999" })]).finalPrice,
    ).toBe(450000);
    expect(
      analyze([pricedPA(450000, true), pricedCP(900000, { refused: true })])
        .finalPrice,
    ).toBe(450000);
  });
  it("reconnaît BO et sa PA par contenu même si le nom est trompeur", () => {
    const b = bo();
    b.name = "[99999]-CP.pdf";
    expect(parseBonification(b)).toMatchObject({
      number: "60006",
      target: "10001",
      amount: 475000,
    });
    expect(
      formNumber(
        b.name,
        b.pages.map((p) => p.text),
      ),
    ).toBe("60006");
    expect(analyze([pricedPA(), b])).toMatchObject({
      priceSourceForm: "BO",
      priceSourceSection: "B2.1",
      priceSourceDocument: b.name,
    });
  });
  it("lit les champs BO décalés avant les libellés dans le texte aplati", () => {
    const b = bo();
    b.pages[0].words = [
      word("B1.", 40, 100),
      word("IDENTIFICATION", 100, 100),
      word("10001", 350, 119),
      word("Les parties conviennent de bonifier la PA", 40, 124),
      word("B2.", 40, 190),
      word("BONIFICATION", 100, 190),
      word("B2.1", 40, 220),
      word("PRIX D'ACHAT", 100, 220),
      word("475000", 350, 245),
      word("(", 330, 250),
      word("$)", 450, 250),
      word("B2.2", 40, 280),
      word("Autre montant 999999 $", 100, 300),
    ];
    expect(parseBonification(b)).toMatchObject({
      target: "10001",
      amount: 475000,
    });
  });
  it("une CP simplement présente mais sans acceptation ne remplace ni date ni prix", () => {
    const cp = pricedCP();
    cp.signatures = [];
    cp.annotations = [];
    const result = analyze([pricedPA(450000, true), cp, fiveDayAF()]);
    expect(result.acceptanceDateTime).toBeNull();
    expect(result.finalPrice).toBe(450000);
  });
  it("une sous-section 12.1.2 reste interprétable", () => {
    const pa = promise({
      clause12: "12.1.2 Vérification dans les 8 jours suivant l'acceptation",
    });
    expect(
      analyze([pa]).deadlines.some(
        (d) => d.sourceSection === "12.1" && d.days === 8,
      ),
    ).toBe(true);
  });
  it("deux BO datées remplacent le prix, ne le cumulent pas", () => {
    expect(
      analyze([pricedPA(), bo(480000, "60007", "10001", "2026-09-03"), bo()])
        .finalPrice,
    ).toBe(480000);
  });
  it("deux BO sans chronologie : prix à confirmer, pas ordre d’upload", () => {
    const a = bo(),
      b = bo(480000, "60007");
    for (const doc of [a, b])
      doc.pages[0].text = doc.pages[0].text.replace(/Signé le .+/, "");
    const result = analyze([pricedPA(), a, b]);
    expect(result.finalPrice).toBeNull();
    expect(result.priceWarnings.join(" ")).toContain("ordre");
  });
  it("BO étrangère ou postérieure à l’acceptation n’écrase pas le prix", () => {
    expect(analyze([pricedPA(), bo(475000, "60006", "99999")]).finalPrice).toBe(
      450000,
    );
    expect(
      analyze([pricedPA(), bo(475000, "60006", "10001", "2026-09-15")])
        .finalPrice,
    ).toBe(450000);
  });
  it.each([
    "450 000 $",
    "450000 $",
    "450 000,00 $",
    "450,000.00 $",
    "450\u00a0000,00 $",
  ])("lit le montant canonique %s", (text) =>
    expect(clauseAmount(text)).toBe(450000),
  );
  it("plusieurs montants contradictoires dans une clause ne sont pas devinés", () =>
    expect(clauseAmount("450000 $ ou 475000 $")).toBeNull());
  it.skipIf(!process.env.OACIQ_PRIVATE_BO)(
    "le BO réel reste uniquement local et ses champs sont lisibles",
    async () => {
      const doc = await extractOaciqPdf({
        name: "reference.pdf",
        data: new Uint8Array(readFileSync(process.env.OACIQ_PRIVATE_BO!)),
      });
      const b = parseBonification(doc);
      // Do not print private values in assertion diagnostics.
      expect(Boolean(b.number), "BO number").toBe(true);
      expect(Boolean(b.target), "BO target").toBe(true);
      expect(Boolean(b.amount && b.amount > 0), "BO price").toBe(true);
    },
  );
});
