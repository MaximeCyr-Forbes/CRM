/** Mechanical port of parser.py date helpers; civil days, not 24-hour UTC shifts. */
export const cleanSpaces = (s: string) => s.replace(/\s+/g, " ").trim();
export const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/\p{Mn}/gu, "");
export const norm = (s: string) =>
  stripAccents(cleanSpaces(s)).replace(/[’‘]/g, "'").toLowerCase();
export const cleanAddress = (s: string) =>
  cleanSpaces(s).replace(/^(\d)\s+(\d{2,}\b)/, "$1$2");
export const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const english = [
  "january jan",
  "february feb",
  "march",
  "april apr",
  "may",
  "june",
  "july",
  "august aug",
  "september sep sept",
  "october oct",
  "november nov",
  "december dec",
];
const months: Record<string, number> = {};
MONTHS.forEach((m, i) => {
  months[m] = months[stripAccents(m)] = i + 1;
  for (const alias of english[i].split(" ")) months[alias] = i + 1;
});
export function civilDate(y: number, m: number, d: number): string {
  const s = `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
  const date = new Date(`${s}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== s)
    throw new Error("Date OACIQ invalide.");
  return s;
}
export function parseFrenchDate(s: string): string | null {
  const dayFirst = /(\d{1,2})\s+([A-Za-zéèêëàâîïôûùç]+),?\s+(\d{4})/i.exec(s);
  if (dayFirst && months[dayFirst[2].toLowerCase()])
    return civilDate(
      +dayFirst[3],
      months[dayFirst[2].toLowerCase()],
      +dayFirst[1],
    );
  const monthFirst = /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i.exec(s);
  return monthFirst && months[monthFirst[1].toLowerCase()]
    ? civilDate(
        +monthFirst[3],
        months[monthFirst[1].toLowerCase()],
        +monthFirst[2],
      )
    : null;
}
export function addDays(s: string, days: number): string {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const formatDay = (s: string) =>
  `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`;
const torontoParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function inToronto(instant: Date): string {
  const parts = Object.fromEntries(
    torontoParts.formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const offset = Math.round(
    (Date.parse(`${local}Z`) - instant.getTime()) / 60000,
  );
  return `${local}${offset >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;
}
export function torontoDateTime(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  sec = 0,
): string {
  const day = civilDate(y, m, d);
  if (h > 23 || min > 59 || sec > 59) throw new Error("Heure OACIQ invalide.");
  const local = `${day}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  // Match Python ZoneInfo's default fold=0: the first occurrence of an
  // ambiguous fall-back time, and the pre-transition offset for a spring gap.
  const before = inToronto(new Date(`${addDays(day, -1)}T12:00:00Z`)).slice(-6);
  const after = inToronto(new Date(`${addDays(day, 1)}T12:00:00Z`)).slice(-6);
  const valid = [...new Set([before, after])]
    .map((offset) => `${local}${offset}`)
    .filter(
      (candidate) => inToronto(new Date(candidate)).slice(0, 19) === local,
    )
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return valid[0] || `${local}${before}`;
}
export function parsePdfSignatureDate(s: string): string | null {
  const m =
    /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'?\d{2}'?)?/.exec(
      s,
    );
  if (!m) return null;
  if (!m[7]) return torontoDateTime(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  const offset =
    m[7] === "Z"
      ? "Z"
      : m[7].replace(/'/g, "").replace(/([+-]\d{2})(\d{2})/, "$1:$2");
  return inToronto(
    new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`),
  );
}
export function parseVisibleSignatureDate(s: string): string | null {
  const m =
    /(?:signe|signed)\s+(?:le|on)\s+(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i.exec(
      norm(s),
    );
  return m
    ? torontoDateTime(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0))
    : null;
}
export function extractTimeText(s: string): string {
  const m = [
    ...s.matchAll(/(?<!\d)([01]?\d|2[0-3])\s*(?::|h|\s)\s*([0-5]\d)(?!\d)/gi),
  ].at(-1);
  return m ? `${+m[1]}h${m[2] === "00" ? "" : m[2]}` : "";
}
export function timeToIso(s: string): string | null {
  const m = /(?:^|\s)(\d{1,2})h(\d{2})?\b/.exec(s);
  return m && +m[1] <= 23 ? `${m[1].padStart(2, "0")}:${m[2] || "00"}` : null;
}
export const latest = (values: (string | null | undefined)[]) =>
  values
    .filter((x): x is string => !!x)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
export function deadlineSortValue(
  text: string,
  label: string,
  year: number,
): string {
  const rank =
    [
      ["inspection", "1"],
      ["rapport", "2"],
      ["notaire", "3"],
      ["occupation", "4"],
    ].find(([key]) => norm(label).includes(key))?.[1] || "9";
  const relative = /^(\d+)\s+jours?\s+après/i.exec(text);
  if (relative)
    return `9999-12-31|${String(+relative[1]).padStart(5, "0")}-${rank}-${label}`;
  const m = /(\d{1,2})\s+([A-Za-zéèêëàâîïôûùç]+)/i.exec(text);
  return `${m && months[m[2].toLowerCase()] ? civilDate(year, months[m[2].toLowerCase()], +m[1]) : "9999-12-31"}|${rank}-${label}`;
}
