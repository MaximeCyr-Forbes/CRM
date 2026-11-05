import type { CmaReportData } from "@/app/lib/tools/acm/types";
import { getPropertySourceLabel, PROPERTY_STATUS_LABELS } from "../presentation";
import { formatCmaCurrency, formatSignedCurrency, REFERENCE_PRICE_SOURCE_LABELS } from "../value-presentation";

interface AnalysisSummaryProps {
  report: CmaReportData;
  onAdjust: (propertyId: string) => void;
}

export function AnalysisSummary({ report, onAdjust }: AnalysisSummaryProps) {
  return (
    <section className="analysis-summary" aria-labelledby="analysis-summary-title">
      <div className="analysis-section-heading">
        <div>
          <span className="property-results__eyebrow">Comparables inclus seulement</span>
          <h3 id="analysis-summary-title">Résumé de l’analyse</h3>
        </div>
        <p>Ces statistiques soutiennent l’analyse du courtier sans constituer une opinion de valeur.</p>
      </div>

      <div className="analysis-summary__list">
        {report.comparables.length === 0 ? (
          <div className="analysis-summary__empty">Aucun comparable n’est actuellement inclus dans l’ACM.</div>
        ) : report.comparables.map(({ property, analysis }, index) => (
          <article className="analysis-summary-card" key={property.id}>
            <div className="analysis-summary-card__identity">
              <span>Comparable {index + 1}</span>
              <h4>{property.data.address ?? (property.documentType === "centris" ? `Centris ${property.data.centrisNumber ?? "non détecté"}` : property.sourceFile)}</h4>
              <small>{getPropertySourceLabel(property)} · {property.data.status ? PROPERTY_STATUS_LABELS[property.data.status] : "Statut non détecté"}</small>
              <button type="button" onClick={() => onAdjust(property.id)}>Ajuster ce comparable</button>
            </div>
            <dl>
              <div><dt>Prix demandé</dt><dd>{formatCmaCurrency(property.data.askingPrice)}</dd></div>
              <div><dt>Prix vendu</dt><dd>{formatCmaCurrency(property.data.soldPrice)}</dd></div>
              <div><dt>{analysis.referencePriceSource ? REFERENCE_PRICE_SOURCE_LABELS[analysis.referencePriceSource] : "Prix de référence"}</dt><dd>{formatCmaCurrency(analysis.referencePrice)}</dd></div>
              <div><dt>Ajustement total</dt><dd>{formatSignedCurrency(analysis.totalAdjustments)}</dd></div>
              <div className="analysis-summary-card__adjusted"><dt>Prix ajusté</dt><dd>{formatCmaCurrency(analysis.adjustedPrice)}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <div className="analysis-statistics" aria-label="Statistiques des prix ajustés">
        <div><span>Prix ajusté le plus bas</span><strong>{formatCmaCurrency(report.statistics.minimum)}</strong></div>
        <div><span>Prix ajusté le plus élevé</span><strong>{formatCmaCurrency(report.statistics.maximum)}</strong></div>
        <div><span>Moyenne</span><strong>{formatCmaCurrency(report.statistics.average)}</strong></div>
        <div><span>Médiane</span><strong>{formatCmaCurrency(report.statistics.median)}</strong></div>
      </div>
    </section>
  );
}
