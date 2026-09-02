/** Faithful port of parse_files/parse_pa from App Courriel PA acceptée.
 * Human-readable deadlines and rule precedence are preserved. The CRM adapter
 * adds ISO dates and provenance at emission time, never by guessing a year from
 * the reference reader's abbreviated display strings. No email generation. */
import {
  addDays,
  cleanSpaces,
  deadlineSortValue,
  extractTimeText,
  formatDay,
  inToronto,
  norm,
  parseFrenchDate,
  timeToIso,
} from "./dates";
import {
  acceptanceFromResponseText,
  acceptanceFromSignatures,
  documentKind,
  extractActualClause,
  extractClause12,
  extractClause12Words,
  extractClauseDateTimeWords,
  extractClauseDaysWords,
  extractPadInspectionScope,
  extractParties,
  extractPropertyAddress,
  extractResponseAction,
  formNumber,
  inspectionLabels,
  pagesText,
  parseCounterProposal,
  textBetween,
} from "./forms";
import { parseAnnexF, parseAnnexR, parseAnnexWater } from "./annexes";
import { isExcludedDeadlineSection } from "./deadline-sections";
import { resolveFinalPrice } from "./price";
import {
  calculateTransactionDates,
  resolveCounterProposalChain,
  selectMainPromise,
} from "./chain";
import type {
  OaciqAnalysis,
  OaciqDeadline,
  OaciqExtractedDocument as Doc,
} from "./types";

const findDays = (pattern: RegExp, text: string): number | null => {
  const m = pattern.exec(text);
  return m ? +m[1] : null;
};
const deadlineDays = (text: string) =>
  findDays(
    /(?:dans\s+(?:les?|es)|within(?:\s+a\s+period\s+of)?)\s+(\d+)(?:\s|_){1,15}(?:jours?|days?)/i,
    text,
  );
const relativeR2 = (text: string) =>
  findDays(/(\d+)\s*(?:jours?)?\s+apr[eè]s\s+R2\.1/i, text);
const r2Text = (days: number) =>
  `${days} ${days === 1 ? "jour" : "jours"} après la réalisation de la conditionnelle de vente`;
const acceptanceDaysPattern =
  /(?:dans\s+les|within)\s+(\d+)\s+(?:jours|days)\s+(?:suivant(?:e|es|s)?|following)\s+(?:l.?acceptation|acceptance)/i;
type Origin = { document: Doc; section: string; text: string; type: string; verifiedPositionedClause?: boolean };

export function analyzeExtractedOaciqDocuments(
  documents: Doc[],
): OaciqAnalysis {
  if (!documents.length || documents.some((d) => !d.name || !d.pages.length))
    throw new Error("Dépose au moins un document OACIQ lisible.");
  if (new Set(documents.map((d) => d.name)).size !== documents.length)
    throw new Error("Les documents OACIQ doivent avoir des noms distincts.");
  const forms = documents.map((d) => ({
    document: d.name,
    kind: documentKind(pagesText(d)),
    number: formNumber(d.name, pagesText(d)),
  }));
  const ofKind = (kind: string) =>
    documents.filter((_, i) => forms[i].kind === kind);
  const annexes = ofKind("annex_r")
    .map((doc) => ({ doc, value: parseAnnexR(doc) }))
    .filter((x) => x.value !== null);
  const financial = ofKind("annex_f")
    .map((doc) => ({ doc, value: parseAnnexF(doc) }))
    .filter((x) => x.value !== null);
  const water = ofKind("annex_water")
    .map((doc) => ({ doc, value: parseAnnexWater(doc) }))
    .filter((x) => x.value !== null);
  const counters = ofKind("counter_proposal").map(parseCounterProposal);
  const candidates = ofKind("promise_to_purchase");
  if (!candidates.length) {
    const unknown = ofKind("unknown").sort((a, b) =>
      a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
    );
    if (unknown[0]) candidates.push(unknown[0]);
  }
  if (!candidates.length)
    throw new Error(
      "Dépose aussi la promesse d'achat PA, PAD ou PP liée à la contre-proposition.",
    );
  const main = selectMainPromise(
    candidates,
    counters,
    annexes.map((a) => a.value!),
  );
  const pages = pagesText(main),
    combined = pages.join("\n"),
    number = formNumber(main.name, pages);
  const response = extractResponseAction(main),
    counter = resolveCounterProposalChain(number, response, counters);
  let related = annexes.filter(
    (a) =>
      a.value!.targetFormNumber === number ||
      counter?.annexNumbers.includes(a.value!.formNumber),
  );
  if (!related.length && annexes.length === 1) related = annexes;
  const rEntry =
    related.find(
      (a) => a.value!.targetFormNumber && a.value!.targetFormNumber === number,
    ) || (related.length === 1 ? related[0] : null);
  const fEntry =
    financial.find(
      (a) => a.value!.targetFormNumber && a.value!.targetFormNumber === number,
    ) || (financial.length === 1 ? financial[0] : null);
  const wEntry =
    water.find(
      (a) => a.value!.targetFormNumber && a.value!.targetFormNumber === number,
    ) || (water.length === 1 ? water[0] : null);
  const r = rEntry?.value || null,
    f = fEntry?.value || null,
    w = wEntry?.value || null;
  const counterDoc =
    documents.find((d) => d.name === counter?.fileName) || main;
  const [buyers, sellers] = extractParties(main);
  const accepted =
    counter?.acceptedAt ||
    (["counter", "refuse"].includes(response.action)
      ? null
      : acceptanceFromResponseText(pages) ||
        acceptanceFromSignatures(main.signatures, sellers, buyers));
  const warnings: string[] = [];
  if (!accepted)
    warnings.push(
      "Date d'acceptation du vendeur non détectée; les délais concernés sont affichés en nombre de jours après l'acceptation.",
    );
  const acceptedDay = accepted?.slice(0, 10) || null;
  const deferred = !!(r?.allDeadlinesDeferred || counter?.allDeadlinesDeferred);
  const base = deferred ? null : acceptedDay;
  const basis = deferred
    ? "la réception de l'avis écrit du vendeur"
    : "l'acceptation";
  const deadlines: OaciqDeadline[] = [];
  const origin = (
    section: string,
    type: string,
    text = "",
    document = main,
  ): Origin => ({ document, section, text, type });
  function emit(
    title: string,
    dateText: string,
    details: string,
    dueDate: string | null,
    src: Origin,
    dueTime: string | null = null,
    baseDate: string | null = null,
    days: number | null = null,
  ) {
    if (isExcludedDeadlineSection(src.section)) return;
    deadlines.push({
      title,
      type: src.type,
      dueDate,
      dueTime,
      dateText,
      details,
      sourceDocument: src.document.name,
      sourceForm:
        formNumber(src.document.name, pagesText(src.document)) ||
        documentKind(pagesText(src.document)),
      sourceSection: src.section || null,
      sourceText: src.text || null,
      confidence: dueDate ? (src.text || src.verifiedPositionedClause ? "high" : "medium") : "low",
      baseDate,
      days,
    });
  }
  function fixed(
    date: string | null,
    title: string,
    src: Origin,
    details = "",
    suffix = "",
  ) {
    if (date)
      emit(
        title,
        `${formatDay(date)}${suffix}`,
        details,
        date,
        src,
        timeToIso(suffix),
      );
  }
  function after(
    days: number,
    title: string,
    src: Origin,
    details = "",
    suffix = "",
    reference = base,
    relativeTo = basis,
  ) {
    const dueDate = reference ? addDays(reference, days) : null;
    const dateText = dueDate
      ? formatDay(dueDate)
      : `${days} ${days === 1 ? "jour" : "jours"} après ${relativeTo}`;
    emit(
      title,
      dateText + suffix,
      details,
      dueDate,
      src,
      timeToIso(suffix),
      reference,
      days,
    );
  }
  const annexText = (doc: Doc, clause: string, next: string) =>
    extractActualClause(
      doc.pages.map((p) => p.text),
      clause,
      [next],
    );
  if (r?.saleConditionChecked && r.deadlineDate)
    fixed(
      r.deadlineDate,
      "Délai pour la vente de la propriété de l'acheteur",
      origin(
        "R2.1",
        "buyer_property_sale",
        annexText(rEntry!.doc, "R2.1", "R2.2"),
        rEntry!.doc,
      ),
      "Clause R2.1 - conditionnelle à la vente de la propriété de l'acheteur",
      r.deadlineTime ? ` à ${r.deadlineTime}` : "",
    );
  if (r?.otherOfferCancellationDays)
    after(
      r.otherOfferCancellationDays,
      "Délai pour obtenir l'annulation de la première promesse d'achat",
      origin(
        "R2.3",
        "other_offer_cancellation",
        annexText(rEntry!.doc, "R2.3", "R2.4"),
        rEntry!.doc,
      ),
      `Clause R2.3 - ${r.otherOfferCancellationDays} jours après l'acceptation`,
      "",
      acceptedDay,
      "l'acceptation",
    );

  const financingClause = extractActualClause(pages, "6.2", ["6.3"]);
  let financingDays =
    deadlineDays(financingClause) || extractClauseDaysWords(main, "6.2");
  let financingLabel =
      "Délai pour fournir l'acceptation hypothécaire de la banque",
    financingDetails = "";
  let financingSource = origin("6.2", "financing", financingClause);
  if (!financingDays && f) {
    financingDays = f.financingDays;
    financingLabel =
      "Délai pour fournir la preuve de disponibilité des fonds ou d'équité";
    financingDetails = `Clause ${f.clause} - `;
    financingSource = origin(
      f.clause,
      "financing",
      annexText(fEntry!.doc, f.clause, "F2.2"),
      fEntry!.doc,
    );
    // parseAnnexF already verified the F2.1 checkbox and its positioned day
    // count. A flattened line starting with "X F2.1" may lack a text excerpt;
    // that does not make this clearly detected clause less reliable.
    financingSource.verifiedPositionedClause = true;
  }
  if (financingDays)
    after(
      financingDays,
      financingLabel,
      financingSource,
      `${financingDetails}${financingDays} jours après ${basis}`,
    );

  const scope = extractPadInspectionScope(main),
    inspectionClause = extractActualClause(pages, "8.1", ["9.1", "9. EXAMEN"]);
  let inspectionDays =
    deadlineDays(inspectionClause) ||
    findDays(/\b(\d+)\s+dans\s+les\s+jours/i, inspectionClause) ||
    extractClauseDaysWords(main, "8.1", "inspection");
  if (scope === "waived") inspectionDays = null;
  if (inspectionDays) {
    const [inspection, report] = inspectionLabels(scope);
    after(
      inspectionDays,
      inspection,
      origin("8.1", "inspection", inspectionClause),
      `${inspectionDays} jours après ${basis}`,
    );
    after(
      inspectionDays + 4,
      report,
      origin("8.1", "inspection_report", inspectionClause),
      "4 jours après le délai d'inspection",
      " avant 20h",
    );
  }
  let documentsClause = textBetween(combined, "9.1", [
    "10.1",
    "10. DÉCLARATIONS",
    "10. DECLARATIONS",
  ]);
  if (!norm(documentsClause).includes("documents suivants"))
    documentsClause =
      textBetween(combined, "EXAMEN DE DOCUMENTS PAR L'ACHETEUR", [
        "DÉCLARATIONS ET OBLIGATIONS DU VENDEUR",
      ]) || documentsClause;
  const documentsDays =
    deadlineDays(documentsClause) ||
    extractClauseDaysWords(main, "9.1", "following");
  const names =
    /(?:documents suivants|following documents)\s*:\s*(.+?)\s+(?:(?:À|A) cet effet|To this effect)/i.exec(
      documentsClause,
    );
  const hasDocuments =
    !!(names && cleanSpaces(names[1])) ||
    [
      "declaration de copropriete",
      "syndicat des coproprietaires",
      "minutes of the meetings",
      "declaration of co-ownership",
    ].some((s) => norm(documentsClause).includes(s));
  if (documentsDays && hasDocuments) {
    after(
      documentsDays,
      "Délai pour fournir les documents",
      origin("9.1", "documents_delivery", documentsClause),
      `${documentsDays} jours après ${basis}`,
    );
    after(
      documentsDays + 7,
      "Délai pour la lecture des documents",
      origin("9.1", "documents_review", documentsClause),
      "7 jours après le délai de remise des documents",
    );
  }
  const notaryClause = textBetween(combined, "11.1", ["11.2"]);
  const notaryDate =
    counter?.notaryDate ||
    parseFrenchDate(notaryClause) ||
    extractClauseDateTimeWords(main, "11.1", "11.2")[0];
  const notarySource = counter?.notaryDate
    ? origin(
        "P2.3.2",
        "notary",
        annexText(counterDoc, "P2.3.2", "P2.3.3"),
        counterDoc,
      )
    : origin("11.1", "notary", notaryClause);
  const notaryDays =
    !notaryDate && r?.deadlineDate ? relativeR2(notaryClause) : null;
  const notaryLabel = notaryDays ? r2Text(notaryDays) : "";
  if (notaryLabel)
    emit(
      "Signature de l'acte de vente chez le notaire",
      notaryLabel,
      "",
      null,
      notarySource,
    );
  else
    fixed(
      notaryDate,
      "Signature de l'acte de vente chez le notaire",
      notarySource,
    );

  if (w && acceptedDay) {
    const notices: { clause: string; date: string }[] = [];
    const fields: [string, number | null, string][] = [
      [
        "V2.1",
        w.quantityDays,
        "Délai pour obtenir le résultat du test de quantité d'eau potable",
      ],
      [
        "V2.2",
        w.qualityDays,
        "Délai pour obtenir le résultat du test de qualité de l'eau potable",
      ],
      ["V2.3", w.septicDays, "Délai pour vérifier les installations septiques"],
    ];
    const addWater = ([clause, days, title]: [
      string,
      number | null,
      string,
    ]) => {
      if (!days) return;
      fixed(
        addDays(acceptedDay, days),
        title,
        origin(
          clause,
          "water_condition",
          annexText(wEntry!.doc, clause, `V2.${+clause.slice(-1) + 1}`),
          wEntry!.doc,
        ),
        `Clause ${clause} - ${days} jours après l'acceptation`,
      );
      notices.push({ clause, date: addDays(acceptedDay, days + 4) });
    };
    fields.forEach(addWater);
    if (w.septicPumping) {
      const src = origin(
          "V2.4",
          "septic_pumping",
          annexText(wEntry!.doc, "V2.4", "V2.5"),
          wEntry!.doc,
        ),
        title =
          "Délai pour faire vidanger la fosse septique et remettre la preuve écrite";
      if (notaryLabel) emit(title, notaryLabel, "Clause V2.4", null, src);
      else fixed(notaryDate, title, src, "Clause V2.4");
    }
    addWater([
      "V2.5",
      w.soilDays,
      "Délai pour obtenir le résultat du test de sol",
    ]);
    if (notices.length) {
      const grouped = new Map<string, string[]>();
      for (const n of notices)
        grouped.set(n.date, [...(grouped.get(n.date) || []), n.clause]);
      const text =
        grouped.size === 1
          ? formatDay(notices[0].date)
          : [...grouped]
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(
                ([date, clauses]) =>
                  `${formatDay(date)} (${clauses.join(", ")})`,
              )
              .join("; ");
      emit(
        "Délai prévu pour informer le vendeur des conclusions de l'annexe EAU",
        text,
        "4 jours après les délais des tests ou vérifications cochés",
        grouped.size === 1 ? notices[0].date : null,
        origin(
          notices.map((n) => n.clause).join(", "),
          "water_notice",
          notices
            .map((n) =>
              annexText(wEntry!.doc, n.clause, `V2.${+n.clause.slice(-1) + 1}`),
            )
            .join("\n"),
          wEntry!.doc,
        ),
      );
    }
  }
  let occupationText = textBetween(combined, "11.2", ["11.3"]);
  for (const page of pages) {
    const m = /LECTURE\s+CIBL[EÉ]E\s+11[\.,]?2([\s\S]*)/i.exec(page);
    if (m) occupationText += ` ${m[1]}`;
  }
  let [occupationDate, occupationTime] = extractClauseDateTimeWords(
    main,
    "11.2",
    "11.3",
  );
  if (!occupationDate) {
    occupationDate = parseFrenchDate(occupationText);
    occupationTime = extractTimeText(occupationText);
  }
  if (counter?.occupationDate) {
    occupationDate = counter.occupationDate;
    occupationTime = counter.occupationTime;
  }
  let occupationLabel = "";
  if (occupationDate)
    occupationLabel = `${formatDay(occupationDate)}${occupationTime ? ` à ${occupationTime}` : ""}`;
  else if (r?.deadlineDate) {
    const n = relativeR2(occupationText);
    if (n) occupationLabel = r2Text(n);
  } else if (/selon les baux|selon baux/.test(norm(occupationText)))
    occupationLabel = "Selon les baux";
  else if (
    notaryDate &&
    /acte notarie|notarial deed/.test(norm(occupationText))
  )
    occupationLabel = formatDay(notaryDate);
  if (occupationLabel)
    emit(
      "Occupation des lieux par l'acheteur",
      occupationLabel,
      "",
      occupationDate ||
        (notaryDate && occupationLabel === formatDay(notaryDate)
          ? notaryDate
          : null),
      counter?.occupationDate
        ? origin(
            "P2.3.3",
            "occupancy",
            annexText(counterDoc, "P2.3.3", "P2.3.4"),
            counterDoc,
          )
        : origin("11.2", "occupancy", occupationText),
      timeToIso(occupationTime),
    );

  const clause12 = extractClause12(pages),
    clause12Text = cleanSpaces(`${clause12} ${extractClause12Words(main)}`),
    c = norm(clause12Text);
  const src12 = (type = "other_condition") =>
    origin("12.1", type, clause12Text);
  if (clause12Text) {
    if (r?.deadlineDate && c.includes("inspection") && c.includes("r2.1")) {
      const days = findDays(
        /dans\s+les\s+(\d+)\s+jours\s+suivant\s+la\s+r[eé]alisation/i,
        c,
      );
      if (days) {
        const [inspection, report] = inspectionLabels(
          c.includes("partie privative")
            ? "private"
            : scope === "waived"
              ? "building"
              : scope,
        );
        for (const [title, text, details, type] of [
          [
            inspection,
            r2Text(days),
            `Clause 12.1 - ${days} jours après la réalisation de R2.1`,
            "inspection",
          ],
          [
            report,
            `${r2Text(days + 4)} avant 20h`,
            "4 jours après le délai d'inspection",
            "inspection_report",
          ],
        ]) {
          if (!deadlines.some((d) => d.title === title && d.dateText === text))
            emit(title, text, details, null, src12(type), timeToIso(text));
        }
      }
    } else if (
      c.includes("resiliation du bail") &&
      c.includes("locataire") &&
      c.includes("quitter")
    ) {
      const days = findDays(
        /dans\s+les\s+(\d+)\s+jours\s+suivant\s+l.?acceptation/i,
        c,
      );
      const cancel =
        findDays(/\((\d+)\)\s+jours\s+suivant\s+l.?expiration/i, c) || 4;
      if (days) {
        after(
          days,
          "Délai pour fournir les documents de résiliation du bail",
          src12(),
          "Clause 12.1",
        );
        after(
          days + cancel,
          "Délai pour aviser le vendeur si les documents de résiliation ne sont pas fournis",
          src12(),
          `Clause 12.1 - ${cancel} jours après le délai de remise`,
        );
      }
      const departure = parseFrenchDate(clause12Text);
      if (departure) {
        fixed(
          departure,
          "Délai pour la libération du logement par le locataire",
          src12(),
          "Clause 12.1",
        );
        fixed(
          addDays(departure, cancel),
          "Délai pour aviser le vendeur si le logement n'est pas libéré",
          src12(),
          `Clause 12.1 - ${cancel} jours après la date prévue`,
        );
      }
    } else if (
      (c.includes("visiter les 2 logements") && c.includes("lendemain")) ||
      (c.includes("24 h suivant sa visite") && c.includes("tests d'air"))
    ) {
      after(1, "Délai pour visiter les 2 logements", src12(), "Clause 12.1");
      after(
        2,
        "Délai pour aviser le vendeur si l'acheteur n'est pas satisfait de la visite",
        src12(),
        "Clause 12.1 - 24h après la visite",
      );
      after(
        0,
        "Délai pour remettre les documents d'inspection/tests d'air en possession du vendeur",
        src12(),
        "Clause 12.1",
      );
      after(
        1,
        "Délai pour la lecture des documents prévus à la clause 12.1",
        src12(),
        "Clause 12.1 - 24h après réception",
      );
    } else if (/visiter physiquement|physical visit/.test(c)) {
      const days = findDays(acceptanceDaysPattern, clause12Text);
      if (days) {
        after(
          days,
          "Délai pour visiter physiquement l'immeuble",
          src12(),
          `Clause 12.1 - ${days} jours après ${basis}`,
        );
        const later = findDays(
          /(?:dans\s+les|within)\s+(\d+)\s+(?:jours|days)\s+(?:suivant(?:e|es|s)?|following)\s+(?:l.?expiration|the\s+expiration)/i,
          clause12Text,
        );
        if (later)
          after(
            days + later,
            "Délai pour aviser le vendeur si l'acheteur n'est pas satisfait de la visite",
            src12(),
            `Clause 12.1 - ${later} jours après l'expiration du délai de visite`,
          );
      }
    } else {
      const days = findDays(acceptanceDaysPattern, clause12Text);
      if (days)
        after(
          days,
          "Délai prévu à la clause 12.1",
          src12(),
          `${days} jours après ${basis}`,
        );
      else
        warnings.push(
          "Clause 12.1 détectée, mais aucun délai clair n'a été trouvé.",
        );
    }
  }
  const year = +(acceptedDay || inToronto(new Date()).slice(0, 10)).slice(0, 4);
  deadlines.sort((a, b) => {
    const x = deadlineSortValue(a.dateText, a.title, year),
      y = deadlineSortValue(b.dateText, b.title, year);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return {
    ...resolveFinalPrice(documents, main, accepted),
    documents: documents.map((d) => ({
      name: d.name,
      pageCount: d.pages.length,
      ocrUsed: !!d.ocrPages,
    })),
    forms,
    mainDocument: main.name,
    acceptanceDateTime: accepted,
    acceptanceSource: counter?.fileName || main.name,
    propertyAddress: extractPropertyAddress(main),
    buyerNames: buyers,
    sellerNames: sellers,
    deadlines,
    warnings,
    allDeadlinesDeferred: deferred,
    transactionDates: calculateTransactionDates(
      accepted,
      financingDays,
      inspectionDays,
      documentsDays,
      r,
      notaryDate,
      occupationDate,
      occupationTime,
      counter,
    ),
  };
}
