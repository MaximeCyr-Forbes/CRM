export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePdfText(value: string): string {
  return value
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line
      .replace(/[ ]+/g, " ")
      .replace(/ *\t+ */g, "\t")
      .trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanExtractedValue(value: string): string | undefined {
  const cleaned = value
    .replace(/^\s*[:\-–—]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || /^(?:n\/a|s\/o|non disponible|inconnu|-)$/i.test(cleaned)) {
    return undefined;
  }

  return cleaned;
}
