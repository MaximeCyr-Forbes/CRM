import { describe, expect, it } from "vitest";
import goldens from "./goldens.json";
import {
  scenarios,
  promise,
  counter,
  annexR,
  document,
  word,
  annexWater,
  annexF,
} from "./test-fixtures";
import { analyzeExtractedOaciqDocuments } from "./parser";
import { analyzeOaciqDocuments } from "./index";
import {
  resolveCounterProposalChain,
  calculateTransactionDates,
} from "./chain";
import {
  acceptanceFromResponseText,
  extractPadInspectionScope,
  parseCounterProposal,
} from "./forms";
import {
  addDays,
  parsePdfSignatureDate,
  parseFrenchDate,
  torontoDateTime,
} from "./dates";

const comparable = (a: ReturnType<typeof analyzeExtractedOaciqDocuments>) => ({
  forms: a.forms,
  mainDocument: a.mainDocument,
  acceptanceDateTime: a.acceptanceDateTime,
  acceptanceSource: a.acceptanceSource,
  deadlines: a.deadlines.map(({ title, dateText, details }) => ({
    title,
    dateText,
    details,
  })),
  warnings: a.warnings,
  transactionDates: a.transactionDates,
  allDeadlinesDeferred: a.allDeadlinesDeferred,
});

describe("OACIQ golden outputs from the current unmodified Python reader", () => {
  for (const s of scenarios)
    it(s.name, () => {
      expect(comparable(analyzeExtractedOaciqDocuments(s.documents))).toEqual(
        goldens[s.name as keyof typeof goldens],
      );
    });
});

describe("source transaction-chain regression tests, adapted from test_transaction_chain.py", () => {
  it("retains the exact corrected multi-form dates", () => {
    const a = analyzeExtractedOaciqDocuments([
      promise({ counter: "20002", pad: true }),
      counter(),
      annexR(),
    ]);
    expect(a.transactionDates).toEqual({
      effective_acceptance_date: "2026-08-16",
      inspection_deadline: "2026-08-26",
      inspection_report_deadline: "2026-08-30",
      documents_delivery_deadline: "2026-08-23",
      documents_review_deadline: "2026-08-30",
      financing_deadline: "2026-08-31",
      other_offer_cancellation_deadline: "2026-09-05",
      deed_of_sale_date: "2026-11-20",
      occupancy_date: "2026-11-30",
      occupancy_time: "11h",
    });
  });
  it("ignores acknowledgment and PDF finalization stamps for acceptance", () => {
    expect(
      acceptanceFromResponseText([
        "Généré le 2026-08-15 16:00:51, Finalisé le 2026-08-16 22:20:40.\nRÉPONSE DU RÉPONDANT\nSigné le 2026-08-16 10:04:13\nSigné le 2026-08-16 10:04:19\nACCUSÉ DE RÉCEPTION\nSigné le 2026-08-16 21:26:44\nSigné le 2026-08-16 22:20:39",
      ]),
    ).toBe("2026-08-16T10:04:19-04:00");
  });
  it("does not treat a PAD counter response as direct acceptance", () => {
    expect(
      analyzeExtractedOaciqDocuments([promise({ counter: "20002" })])
        .acceptanceDateTime,
    ).toBeNull();
    expect(
      analyzeExtractedOaciqDocuments([promise({ counter: "20002" }), counter()])
        .acceptanceDateTime,
    ).toBe("2026-08-16T10:04:19-04:00");
  });
  it("unchecked R2.4/P2.4 do not shift deadlines; checked does not invent a receipt date", () => {
    const a = analyzeExtractedOaciqDocuments([
      promise({ counter: "20002" }),
      counter(),
      annexR(),
    ]);
    expect(a.transactionDates.inspection_deadline).toBe("2026-08-26");
    const deferred = analyzeExtractedOaciqDocuments([
      promise({ counter: "20002" }),
      counter(),
      annexR({ defer: true }),
    ]);
    expect(deferred.transactionDates.inspection_deadline).toBeNull();
    expect(deferred.transactionDates.other_offer_cancellation_deadline).toBe(
      "2026-09-05",
    );
    expect(
      deferred.deadlines.find((d) => d.type === "financing"),
    ).toMatchObject({
      dueDate: null,
      confidence: "low",
      dateText: "15 jours après la réception de l'avis écrit du vendeur",
    });
  });
  it("valid counter changes only modified terms", () => {
    const c = parseCounterProposal(counter());
    const a = calculateTransactionDates(
      c.acceptedAt,
      15,
      10,
      7,
      null,
      "2026-11-23",
      "2026-11-27",
      "12h",
      c,
    );
    expect(a.deed_of_sale_date).toBe("2026-11-20");
    expect(a.occupancy_date).toBe("2026-11-30");
    expect(a.financing_deadline).toBe("2026-08-31");
    expect(a.documents_delivery_deadline).toBe("2026-08-23");
  });
  it("successive counter chain is independent of upload order", () => {
    const first = parseCounterProposal(
        counter({ number: "20001", next: "20002" }),
      ),
      last = parseCounterProposal(counter({ target: "20001" }));
    for (const cs of [
      [first, last],
      [last, first],
    ])
      expect(
        resolveCounterProposalChain(
          "10001",
          { action: "counter", counterProposalNumber: "20001" },
          cs,
        ),
      ).toBe(last);
  });
  it("all six PAD/CP/AR permutations yield identical deadlines", () => {
    const p = promise({ counter: "20002", pad: true }),
      c = counter(),
      r = annexR();
    const outputs = [
      [p, c, r],
      [p, r, c],
      [c, p, r],
      [c, r, p],
      [r, p, c],
      [r, c, p],
    ].map((ds) => analyzeExtractedOaciqDocuments(ds));
    for (const out of outputs) {
      expect(out.deadlines).toEqual(outputs[0].deadlines);
      expect(out.transactionDates).toEqual(outputs[0].transactionDates);
    }
  });
});

describe("CRM adapter provenance and ambiguity safeguards", () => {
  it("keeps the right document/clause for overridden dates and financing annex", () => {
    const a = analyzeExtractedOaciqDocuments([
      promise({ counter: "20002", financing: 0 }),
      counter(),
      annexF(),
    ]);
    expect(a.deadlines.find((d) => d.type === "notary")).toMatchObject({
      dueDate: "2026-11-20",
      sourceDocument: "CP-20002.pdf",
      sourceSection: "P2.3.2",
    });
    expect(a.deadlines.find((d) => d.type === "occupancy")).toMatchObject({
      dueDate: "2026-11-30",
      dueTime: "11:00",
      sourceSection: "P2.3.3",
    });
    expect(a.deadlines.find((d) => d.type === "financing")).toMatchObject({
      sourceDocument: "AF-40004.pdf",
      sourceSection: "F2.1",
      dueDate: "2026-08-28",
    });
  });
  it("keeps source clauses, exact year and 20h without host-timezone conversions", () => {
    const a = analyzeExtractedOaciqDocuments([promise({ date: "2026-12-28" })]);
    expect(
      a.deadlines.find((d) => d.type === "inspection_report"),
    ).toMatchObject({
      dueDate: "2027-01-11",
      dueTime: "20:00",
      sourceSection: "8.1",
      sourceText: expect.stringContaining("10 jours"),
    });
  });
  it("does not flatten several EAU notice dates to a fabricated single date", () => {
    const a = analyzeExtractedOaciqDocuments([promise(), annexWater()]);
    expect(a.deadlines.find((d) => d.type === "water_notice")).toMatchObject({
      dueDate: null,
      confidence: "low",
      sourceDocument: "EAU-50005.pdf",
      dateText: expect.stringContaining(";"),
    });
  });
  it("rejects ambiguous multiple promises", () => {
    expect(() =>
      analyzeExtractedOaciqDocuments([promise(), promise({ number: "10002" })]),
    ).toThrow("transaction unique");
  });
  it("selects the promise actually referenced by the counter", () => {
    expect(
      analyzeExtractedOaciqDocuments([
        promise({ number: "10002" }),
        counter(),
        promise(),
      ]).mainDocument,
    ).toBe("PA-10001.pdf");
  });
  it("rejects a circular chain", () => {
    const one = parseCounterProposal(
      counter({ number: "20001", next: "20002" }),
    );
    const two = parseCounterProposal(
      counter({ number: "20002", next: "20001", target: "20001" }),
    );
    expect(() =>
      resolveCounterProposalChain(
        "10001",
        { action: "counter", counterProposalNumber: "20001" },
        [one, two],
      ),
    ).toThrow("circulaire");
  });
  it("refused and unrelated counters do not replace the PA", () => {
    const a = analyzeExtractedOaciqDocuments([
      promise({ counter: "20002" }),
      counter({ target: "99999" }),
    ]);
    expect(a.acceptanceDateTime).toBeNull();
  });
  it("accepts OCR supplied by server extraction without a browser dependency", async () => {
    const text = promise().pages[0].text;
    const doc = document("PA-10001.pdf", "");
    doc.ocrPages = [text];
    const a = await analyzeOaciqDocuments([doc]);
    expect(a.documents[0].ocrUsed).toBe(true);
    expect(a.transactionDates.financing_deadline).toBe("2026-08-31");
    expect(a).not.toHaveProperty("email");
  });
  it("distinguishes PAD private inspection initials from waiver initials", () => {
    const d = promise({ pad: true });
    d.pages[0].words = [
      word("8.1", 40, 200),
      word("apposant", 110, 230),
      word("apposant", 110, 310),
      word("9", 40, 370),
      word("AB", 55, 240),
    ];
    expect(extractPadInspectionScope(d)).toBe("private");
    d.pages[0].words.push(word("CD", 55, 320));
    expect(extractPadInspectionScope(d)).toBe("waived");
  });
  it("rejects empty input, duplicate names and oversized input", async () => {
    await expect(analyzeOaciqDocuments([])).rejects.toThrow();
    await expect(analyzeOaciqDocuments([promise(), promise()])).rejects.toThrow(
      "noms distincts",
    );
    await expect(
      analyzeOaciqDocuments(Array.from({ length: 21 }, () => promise())),
    ).rejects.toThrow("Nombre");
  });
});

describe("source date rules", () => {
  it.each([
    ["D:20260816140419Z", "2026-08-16T10:04:19-04:00"],
    ["D:20260116140419Z", "2026-01-16T09:04:19-05:00"],
    ["D:20260816100419-04'00'", "2026-08-16T10:04:19-04:00"],
  ])("converts signature %s in Toronto", (input, expected) =>
    expect(parsePdfSignatureDate(input)).toBe(expected),
  );
  it("preserves civil days across DST and leap years", () => {
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(torontoDateTime(2026, 11, 1, 0, 30)).toBe(
      "2026-11-01T00:30:00-04:00",
    );
    expect(torontoDateTime(2026, 11, 1, 4, 30)).toBe(
      "2026-11-01T04:30:00-05:00",
    );
    expect(torontoDateTime(2026, 11, 1, 1, 30)).toBe(
      "2026-11-01T01:30:00-04:00",
    );
    expect(torontoDateTime(2026, 3, 8, 2, 30)).toBe(
      "2026-03-08T02:30:00-05:00",
    );
  });
  it("rejects impossible civil dates instead of normalizing them silently", () =>
    expect(() => parseFrenchDate("31 février 2026")).toThrow());
});
