import { norm } from "./dates";
/** native_reader.make_clauses, source 1474422. Numeric references inside
 * P2.3.4 are content; continuation pages retain the same clause. */
export function counterClauses(pages: string[]): Record<string, string> {
  const clauses: Record<string, string> = {};
  let current = "";
  for (const text of pages) for (const line of text.split("\n")) {
    if (/L.OACIQ A POUR MISSION|INFO OACIQ|© Organisme/.test(line)) continue;
    if (/^\s*P\s*3\.\s/.test(line)) { current = ""; continue; }
    const match = /^\s*(P\s*\d+\.\d+(?:\.\d+)?)\b/.exec(line);
    if (match) {
      current = match[1].replace(/\s/g, "");
      clauses[current] = (clauses[current] && /SUITE/i.test(line) ? clauses[current] + "\n" : "") + line;
    } else if (current) clauses[current] += "\n" + line;
  }
  return clauses;
}
export function cancelledCounterClauses(text: string): string[] {
  return [...norm(text).matchAll(/(?:(\d+\.\d+)\s+clause|clause\s+(\d+\.\d+))\s+(?:est\s+)?annulee/g)].map(m => m[1] || m[2]);
}
/** native_reader.time_in: an explicit hour marker is required, minutes optional. */
export function counterTime(text: string): string {
  const m = /\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?\b/i.exec(text);
  return m ? `${Number(m[1])}h${m[2] && m[2] !== "00" ? m[2] : ""}` : "";
}
