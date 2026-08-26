export function normalizePurchaseAgreementText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function compactPurchaseAgreementText(value: string) {
  return normalizePurchaseAgreementText(value).replace(/\s/g, "");
}

export function normalizePersonName(value: string) {
  return normalizePurchaseAgreementText(value);
}

export function normalizeAddressPart(value: string) {
  return normalizePurchaseAgreementText(value)
    .replace(/\bQUEBEC\b/g, "QC")
    .replace(/\s+/g, " ");
}

export function normalizeCivicNumber(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s/g, "")
    .replace(/[^A-Za-z0-9-]/g, "")
    .toUpperCase();
}

export function normalizePostalCode(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
