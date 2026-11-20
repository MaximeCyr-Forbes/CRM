const createdDateFormatter = new Intl.DateTimeFormat("fr-CA", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Toronto",
});

export function formatContactCreatedDate(value: string | null | undefined): string {
  if (!value?.trim()) return "Non disponible";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Non disponible" : createdDateFormatter.format(date);
}
