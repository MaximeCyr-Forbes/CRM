// Entirely synthetic inputs; no real client documents or identifying data.
import type {
  OaciqAnnotation,
  OaciqExtractedDocument as Doc,
  OaciqWord,
} from "./types";
export const word = (text: string, x0: number, top: number): OaciqWord => ({
  text,
  x0,
  top,
});
const annotation = (
  text: string,
  x0: number,
  top: number,
  pageIndex = 0,
): OaciqAnnotation => ({
  text,
  x0,
  top,
  x1: x0 + 20,
  bottom: top + 10,
  pageIndex,
});
export function document(
  name: string,
  text: string,
  words: OaciqWord[] = [],
): Doc {
  return {
    name,
    pages: [{ text, words, width: 612, height: 792 }],
    signatures: [],
    annotations: [],
    signatureWidgets: [],
  };
}
export function promise(
  options: {
    accepted?: boolean;
    pad?: boolean;
    waiver?: boolean;
    counter?: string;
    clause12?: string;
    date?: string;
    english?: boolean;
    financing?: number;
    inspection?: number;
    documents?: number;
    number?: string;
  } = {},
): Doc {
  const number = options.number || "10001",
    en = options.english;
  const doc = document(
    `${options.pad ? "PAD" : en ? "PP" : "PA"}-${number}.pdf`,
    [
      en
        ? "MANDATORY FORM - PROMISE TO PURCHASE"
        : "FORMULAIRE OBLIGATOIRE - PROMESSE D'ACHAT",
      options.pad ? "copropriété divise" : "",
      `${options.pad ? "PAD" : en ? "PP" : "PA"} ${number}`,
      `6.2 ${en ? "within" : "dans les"} ${options.financing ?? 15} ${en ? "days" : "jours"}`,
      "6.3 Financement",
      `8.1 ${en ? "within" : "dans les"} ${options.inspection ?? 10} ${en ? "days" : "jours"}`,
      options.waiver ? "CLAUSE 8.1 OPTION RENONCIATION INITIALEE" : "",
      `9.1 ${en ? "following documents" : "documents suivants"}: déclaration de copropriété ${en ? "To this effect within" : "À cet effet dans les"} ${options.documents ?? 7} ${en ? "days" : "jours"}`,
      "10.1 Déclarations",
      en ? "11.1 November 23, 2026" : "11.1 23 novembre 2026",
      en ? "11.2 November 27, 2026 12:00" : "11.2 27 novembre 2026 12h00",
      "11.3 Autres dispositions",
      ...(options.clause12
        ? ["AUTRES DÉCLARATIONS", `12.1 ${options.clause12}`, "13. SIGNATURES"]
        : []),
      en ? "SELLER'S RESPONSE" : "RÉPONSE DU VENDEUR",
      ...(options.accepted === false
        ? []
        : [`Signé le ${options.date || "2026-08-16"} 10:04:19`]),
      "ACCUSÉ DE RÉCEPTION",
      "Signé le 2026-08-20 22:30:00",
    ].join("\n"),
  );
  if (options.counter) {
    doc.pages[0].words.push(word("contre-proposition", 50, 640));
    doc.annotations.push(
      annotation("X", 35, 640),
      annotation(options.counter, 100, 640),
    );
  }
  return doc;
}
export function counter(
  options: {
    number?: string;
    target?: string;
    next?: string;
    accepted?: string;
    refused?: boolean;
    deferred?: boolean;
    notary?: boolean;
    occupation?: boolean;
  } = {},
): Doc {
  const number = options.number || "20002",
    target = options.target || "10001";
  const words = [
    word("P2.1", 40, 200),
    ...target.split("").map((n, i) => word(n, 390 + i * 15, 220)),
    word("P2.2", 40, 240),
    word("P2.3.2", 40, 280),
    word("P2.3.3", 40, 340),
    word("P2.3.4", 40, 400),
    word("P2.4", 40, 430),
  ];
  if (options.notary !== false)
    words.push(
      word("20", 150, 300),
      word("novembre", 175, 300),
      word("2026", 230, 300),
    );
  if (options.occupation !== false)
    words.push(
      word("30", 150, 360),
      word("novembre", 175, 360),
      word("2026", 230, 360),
      word("11h00", 350, 360),
    );
  if (options.deferred) words.push(word("X", 25, 430));
  const doc = document(
    `CP-${number}.pdf`,
    `CONTRE-PROPOSITION CP ${number}\nP2.1 promesse d'achat ${target}\nAR 30003\nP2.3.2 20 novembre 2026\nP2.3.3 30 novembre 2026 11h\nP2.3.4\nRÉPONSE DU RÉPONDANT\nACCUSÉ DE RÉCEPTION`,
    words,
  );
  if (options.next) {
    doc.pages[0].words.push(word("contre-proposition", 350, 640));
    doc.annotations.push(
      annotation("X", 335, 640),
      annotation(options.next, 400, 640),
    );
  } else
    doc.annotations.push(
      annotation(options.refused ? "refuser" : "accepter", 350, 640),
    );
  doc.signatures.push({
    field: "respondent",
    name: "",
    contact: "",
    reason: "",
    signedAt: options.accepted || "2026-08-16T10:04:19-04:00",
    pageIndex: 0,
    x0: 350,
    top: 680,
  });
  return doc;
}
export function annexR(
  options: {
    defer?: boolean;
    sale?: boolean;
    cancel?: number;
    number?: string;
  } = {},
): Doc {
  const number = options.number || "30003";
  const words = [
    word("10001", 400, 140),
    word("R2.3", 45, 350),
    word("R2.4", 45, 440),
  ];
  if (options.cancel !== 0)
    words.push(
      word("X", 30, 350),
      word(String(options.cancel ?? 20), 330, 370),
      word("jours", 360, 370),
    );
  if (options.defer) words.push(word("X", 30, 440));
  if (options.sale)
    words.push(
      word("R2.1", 45, 235),
      word("30", 275, 280),
      word("septembre", 298, 280),
      word("2026", 356, 280),
      word("18", 490, 280),
      word("30", 540, 280),
    );
  return document(
    `AR-${number}.pdf`,
    `ANNEXE R AR ${number}\nR2.1 conditionnelle à la vente\nR2.2\nR2.3 dans les ${options.cancel ?? 20} jours\nR2.4 report des délais`,
    words,
  );
}
export function annexF(): Doc {
  return document(
    "AF-40004.pdf",
    "ANNEXE F AF 40004\nF2.1 preuve de fonds dans les 12 jours\nF2.2",
    [
      word("10001", 400, 140),
      word("F2.1", 45, 200),
      word("X", 30, 200),
      word("12", 330, 220),
      word("jours", 360, 220),
    ],
  );
}
export function annexWater(): Doc {
  const words = [word("10001", 400, 115)];
  for (let i = 1; i <= 5; i++)
    words.push(
      word(`V2.${i}`, 45, 180 + i * 80),
      word("X", 30, 180 + i * 80),
      word(i === 5 ? "12" : "10", 330, 200 + i * 80),
      word("jours", 360, 200 + i * 80),
    );
  return document(
    "EAU-50005.pdf",
    "ANNEXE EAU POTABLE EAU 50005\nV2.1 Quantité\nV2.2 Qualité\nV2.3 Septique\nV2.4 Vidange\nV2.5 Sol",
    words,
  );
}
export const scenarios: { name: string; documents: Doc[] }[] = [
  { name: "pa", documents: [promise()] },
  { name: "pp-english", documents: [promise({ english: true })] },
  {
    name: "pad-cp-ar",
    documents: [promise({ pad: true, counter: "20002" }), counter(), annexR()],
  },
  {
    name: "pad-cp-ar-reversed",
    documents: [annexR(), counter(), promise({ pad: true, counter: "20002" })],
  },
  {
    name: "cp-chain",
    documents: [
      counter({ number: "20001", next: "20002" }),
      promise({ counter: "20001" }),
      counter({ target: "20001" }),
    ],
  },
  {
    name: "cp-chain-reversed",
    documents: [
      counter({ target: "20001" }),
      promise({ counter: "20001" }),
      counter({ number: "20001", next: "20002" }),
    ],
  },
  { name: "missing-cp", documents: [promise({ counter: "20002" })] },
  {
    name: "refused-cp",
    documents: [promise({ counter: "20002" }), counter({ refused: true })],
  },
  { name: "ar-deferred", documents: [promise(), annexR({ defer: true })] },
  {
    name: "cp-deferred",
    documents: [promise({ counter: "20002" }), counter({ deferred: true })],
  },
  {
    name: "cp-unmodified-fields",
    documents: [
      promise({ counter: "20002" }),
      counter({ notary: false, occupation: false }),
    ],
  },
  { name: "pad-waiver", documents: [promise({ pad: true, waiver: true })] },
  { name: "no-acceptance", documents: [promise({ accepted: false })] },
  { name: "annex-financing", documents: [annexF(), promise({ financing: 0 })] },
  { name: "annex-water", documents: [promise(), annexWater()] },
  { name: "r2-fixed", documents: [annexR({ sale: true }), promise()] },
  {
    name: "r2-inspection",
    documents: [
      promise({
        clause12:
          "Inspection dans les 8 jours suivant la réalisation de R2.1 partie privative",
      }),
      annexR({ sale: true }),
    ],
  },
  {
    name: "lease-cancellation",
    documents: [
      promise({
        clause12:
          "résiliation du bail locataire quitter le 20 décembre 2026 dans les 10 jours suivant l'acceptation et (4) jours suivant l'expiration",
      }),
    ],
  },
  {
    name: "air-test",
    documents: [
      promise({
        clause12:
          "visiter les 2 logements le lendemain; tests d'air 24 h suivant sa visite",
      }),
    ],
  },
  {
    name: "physical-visit",
    documents: [
      promise({
        clause12:
          "visiter physiquement dans les 5 jours suivant l'acceptation et dans les 3 jours suivant l'expiration",
      }),
    ],
  },
  {
    name: "generic-clause",
    documents: [
      promise({
        clause12: "Vérification dans les 8 jours suivant l'acceptation",
      }),
    ],
  },
  {
    name: "ambiguous-clause",
    documents: [
      promise({ clause12: "Condition particulière sans date ni délai clair" }),
    ],
  },
  { name: "year-boundary", documents: [promise({ date: "2026-12-28" })] },
  { name: "dst-spring", documents: [promise({ date: "2026-03-07" })] },
  { name: "dst-fall", documents: [promise({ date: "2026-10-31" })] },
  { name: "leap-year", documents: [promise({ date: "2028-02-25" })] },
  {
    name: "ignored-bo",
    documents: [
      document("BO-60006.pdf", "BONIFICATIONS AVANT ACCEPTATION"),
      promise(),
    ],
  },
];
