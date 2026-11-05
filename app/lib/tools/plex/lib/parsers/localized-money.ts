/**
 * Lit un montant saisi ou extrait d'un document sans supposer un séparateur
 * de milliers particulier. Les formats québécois, français et nord-américains
 * sont acceptés; les chaînes ambiguës ou incomplètes sont refusées.
 */
export function parseLocalizedMoney(rawValue: string): number | null {
  let valueWithoutCurrency = rawValue.trim();
  if (valueWithoutCurrency.startsWith("$")) {
    valueWithoutCurrency = valueWithoutCurrency.slice(1).trim();
  }
  if (valueWithoutCurrency.endsWith("$")) {
    valueWithoutCurrency = valueWithoutCurrency.slice(0, -1).trim();
  }
  if (valueWithoutCurrency.includes("$")) return null;

  const normalizedSpaces = valueWithoutCurrency
    .replace(/[\s\u00a0\u202f]+/g, " ")
    .trim();

  if (
    normalizedSpaces.includes(" ") &&
    !/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(normalizedSpaces)
  ) {
    return null;
  }

  const compact = normalizedSpaces.replace(/ /g, "");

  if (compact === "" || !/^\d+(?:[.,]\d+)*$/.test(compact)) return null;

  let normalized: string;
  if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(compact)) {
    normalized = compact.replace(/,/g, "");
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(compact)) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(compact)) {
    normalized = compact.replace(/[.,]/g, "");
  } else if (/^\d+[.,]\d{1,2}$/.test(compact)) {
    normalized = compact.replace(",", ".");
  } else if (/^\d+$/.test(compact)) {
    normalized = compact;
  } else {
    return null;
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 && value * 100 <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}
