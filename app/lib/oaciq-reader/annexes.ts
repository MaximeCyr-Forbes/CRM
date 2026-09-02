import { cleanSpaces, norm, parseFrenchDate } from "./dates";
import {
  annexClauseIsChecked,
  extractAnnexDaysWords,
  formNumber,
} from "./forms";
import type {
  OaciqAnnexF,
  OaciqAnnexR,
  OaciqAnnexWater,
  OaciqExtractedDocument as Doc,
} from "./types";

export function parseAnnexR(doc: Doc): OaciqAnnexR | null {
  const pages = doc.pages.map((p) => p.text);
  if (!/annexe r|annex r/.test(norm(pages.join("\n")))) return null;
  const wordsByPage = doc.pages.map((p) => p.wordsLoose || p.words),
    words = wordsByPage[0];
  const region = (top: number, bottom: number, left: number, right: number) =>
    words
      .filter(
        (w) => w.top >= top && w.top <= bottom && w.x0 >= left && w.x0 <= right,
      )
      .map((w) => w.text)
      .join(" ");
  const digits = (s: string) => (s.match(/\d+/g) || []).join("");
  const targetFormNumber = digits(region(132, 146, 390, 490));
  const propertyAddress =
    cleanSpaces(region(256, 268, 45, 570)) ||
    cleanSpaces(region(152, 164, 135, 570));
  const deadlineDate = parseFrenchDate(cleanSpaces(region(275, 287, 270, 380)));
  const h = region(275, 287, 485, 510),
    m = region(275, 287, 530, 560);
  const hour = digits(h).padStart(2, "0"),
    minute = digits(m).padStart(2, "0");
  const deadlineTime =
    (h || m) && (+hour || +minute) ? `${hour}h${minute}` : "";
  const saleConditionChecked =
    !!deadlineDate ||
    wordsByPage.some((ws) => annexClauseIsChecked(ws, "R2.1"));
  let otherOfferCancellationDays: number | null = null;
  for (const ws of wordsByPage) {
    const [days, checked] = extractAnnexDaysWords(ws, "R2.3");
    if (checked) {
      otherOfferCancellationDays = days;
      break;
    }
  }
  const allDeadlinesDeferred = wordsByPage.some((ws) =>
    annexClauseIsChecked(ws, "R2.4"),
  );
  if (
    !saleConditionChecked &&
    !otherOfferCancellationDays &&
    !allDeadlinesDeferred
  )
    return null;
  return {
    formNumber: formNumber(doc.name, pages),
    targetFormNumber,
    deadlineDate,
    deadlineTime,
    propertyAddress,
    saleConditionChecked,
    otherOfferCancellationDays,
    allDeadlinesDeferred,
  };
}
export function parseAnnexF(doc: Doc): OaciqAnnexF | null {
  const pages = doc.pages.map((p) => p.text),
    words = doc.pages[0].words;
  if (!/annexe f|annex f/.test(norm(pages.join("\n")))) return null;
  const targetFormNumber = words
    .filter(
      (w) =>
        w.top >= 130 &&
        w.top <= 150 &&
        w.x0 >= 390 &&
        w.x0 <= 520 &&
        /^\d+$/.test(w.text),
    )
    .map((w) => w.text)
    .join("");
  const [financingDays, checked] = extractAnnexDaysWords(words, "F2.1");
  return financingDays && checked
    ? {
        formNumber: formNumber(doc.name, pages),
        targetFormNumber,
        financingDays,
        clause: "F2.1",
      }
    : null;
}
export function parseAnnexWater(doc: Doc): OaciqAnnexWater | null {
  const pages = doc.pages.map((p) => p.text),
    words = doc.pages[0].words;
  if (
    !/annexe eau potable|drinking water and septic/.test(norm(pages.join("\n")))
  )
    return null;
  const targetFormNumber = words
    .filter(
      (w) =>
        w.top >= 105 &&
        w.top <= 125 &&
        w.x0 >= 390 &&
        w.x0 <= 520 &&
        /^\d+$/.test(w.text),
    )
    .map((w) => w.text)
    .join("");
  const checkedDays = (c: string) => {
    const [days, checked] = extractAnnexDaysWords(words, c);
    return checked ? days : null;
  };
  const quantityDays = checkedDays("V2.1"),
    qualityDays = checkedDays("V2.2"),
    septicDays = checkedDays("V2.3"),
    septicPumping = annexClauseIsChecked(words, "V2.4"),
    soilDays = checkedDays("V2.5");
  return quantityDays || qualityDays || septicDays || septicPumping || soilDays
    ? {
        formNumber: formNumber(doc.name, pages),
        targetFormNumber,
        quantityDays,
        qualityDays,
        septicDays,
        septicPumping,
        soilDays,
      }
    : null;
}
