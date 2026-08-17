function formatDatePart(date: Date) {
  return new Intl.DateTimeFormat("fr-CA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatTimePart(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatHistoryDateTime(createdAt: string) {
  const date = new Date(createdAt);
  return `${formatDatePart(date)} — ${formatTimePart(date)}`;
}

export function formatLastContact(createdAt: string) {
  const date = new Date(createdAt);
  return `${formatDatePart(date)} à ${formatTimePart(date)}`;
}
