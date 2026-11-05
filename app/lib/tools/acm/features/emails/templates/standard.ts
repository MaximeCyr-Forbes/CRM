import { PROPERTY_CATEGORY_LABELS } from "../../../lib/constants/property-categories";
import type { CmaReportData, EmailRecipient } from "../../../types";
import { getReportPreparer } from "@/app/lib/tools/acm/features/analysis/preparers";

const EMAIL_CURRENCY_FORMATTER = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function formatCurrency(value: number): string {
  return EMAIL_CURRENCY_FORMATTER.format(value).replace(/[\u00a0\u202f]/g, " ");
}

function comparableCountSentence(count: number): string {
  if (count === 0) return "Aucune propriété comparable n’est actuellement incluse dans l’analyse.";
  if (count === 1) return "Elle a été préparée à partir de 1 propriété comparable sélectionnée.";
  return `Elle a été préparée à partir de ${count} propriétés comparables sélectionnées.`;
}

export function generateStandardEmailSubject(report: CmaReportData): string {
  const location = [clean(report.subject.data.address), clean(report.subject.data.city)].filter(Boolean).join(", ");
  return location ? `Analyse comparative de marché – ${location}` : "Analyse comparative de marché";
}

export function generateStandardEmailBody(report: CmaReportData, recipient: EmailRecipient): string {
  const preparer = getReportPreparer(report.preparedBy);
  const { data } = report.subject;
  const location = [clean(data.address), clean(data.city)].filter(Boolean).join(", ");
  const greeting = clean(recipient.firstName) ? `Bonjour ${clean(recipient.firstName)},` : "Bonjour,";
  const propertyType = clean(data.propertyType)
    || (data.propertyCategory ? PROPERTY_CATEGORY_LABELS[data.propertyCategory] : "");
  const analysisDescription = propertyType
    ? `Tel que discuté, vous trouverez en pièce jointe mon analyse comparative de marché pour cette propriété de type « ${propertyType} ». ${comparableCountSentence(report.comparables.length)}`
    : `Tel que discuté, vous trouverez en pièce jointe mon analyse comparative de marché. ${comparableCountSentence(report.comparables.length)}`;
  const paragraphs = [
    greeting,
    `Merci de m’avoir accordé du temps pour discuter de votre propriété${location ? ` située au ${location}` : ""}.`,
    analysisDescription,
  ];

  const { minimumValue, maximumValue, recommendedValue, brokerComment } = report.opinion;
  if (typeof minimumValue === "number" && Number.isFinite(minimumValue)
    && typeof maximumValue === "number" && Number.isFinite(maximumValue)) {
    paragraphs.push(`Les comparables analysés nous permettent actuellement de situer la valeur de votre propriété dans une fourchette approximative de ${formatCurrency(minimumValue)} à ${formatCurrency(maximumValue)}.`);
  }
  if (typeof recommendedValue === "number" && Number.isFinite(recommendedValue)) {
    paragraphs.push(`Selon les caractéristiques de la propriété et les éléments observés dans l’analyse, la valeur recommandée se situe autour de ${formatCurrency(recommendedValue)}.`);
  }
  if (clean(brokerComment)) paragraphs.push(clean(brokerComment));

  paragraphs.push(
    "Vous trouverez également dans le document une présentation de notre équipe ainsi que de notre approche de mise en marché.",
    "Ce sera un plaisir de vous accompagner dans vos démarches lorsque le moment sera venu.",
    "N’hésitez pas à me contacter si vous avez des questions concernant l’analyse.",
    "Au plaisir,",
    preparer.emailSignatureLines.join("\n"),
  );

  return paragraphs.join("\n\n");
}
