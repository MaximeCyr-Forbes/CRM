export function sanitizeFileNamePart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
}

export function createReportFileName(address?: string, city?: string): string {
  const location = [address, city].map((part) => sanitizeFileNamePart(part ?? "")).filter(Boolean).join("_");
  return `ACM_${location || "Propriete"}.pdf`;
}
