import type { Listing } from '../data/listing-types';
import { areaLabel, subtypeLabel, knownStandardStatuses } from '../lib/centris/details';

export function CentrisChangeBadge({ listing }: { listing: Listing }) {
  if (!listing.centrisDetails?.last_change_at) return null;
  return <span className="centris-change-badge">{listing.centrisDetails.last_change_kind === 'price' ? 'Prix modifié par Centris' : 'Changement Centris à vérifier'}</span>;
}
export function CentrisPropertyDetails({ listing }: { listing: Listing }) {
  if (!listing.centrisListingKey) return null;
  const d = listing.centrisDetails;
  const fields = d ? [
    ['Chambres', d.bedrooms_total], ['Salles de bain', d.bathrooms_full], ["Salles d’eau", d.bathrooms_partial],
    ['Année de construction', d.year_built], ['Superficie habitable', areaLabel(d.living_area, d.living_area_units)],
    ['Terrain', areaLabel(d.lot_area, d.lot_area_units)], ['Garage', d.garage === null ? null : d.garage ? 'Oui' : 'Non'],
    ['Places au garage', d.garage_spaces], ['Stationnements', d.parking_total],
  ] : [];
  const standard = listing.centrisStandardStatus;
  return <section className="listing-detail-section centris-property" aria-labelledby="centris-property-title">
    <div className="listing-detail-section-heading"><div><p className="section-kicker">Données Centris</p><h2 id="centris-property-title">CARACTÉRISTIQUES DE LA PROPRIÉTÉ</h2></div></div>
    <p className="centris-source-status">Statut Centris : <strong>{standard || 'Non renseigné'}</strong>{listing.centrisMlsStatus && listing.centrisMlsStatus !== standard && ` · ${listing.centrisMlsStatus}`}</p>
    <CentrisChangeBadge listing={listing} />
    {standard && standard !== 'Active' && <p className="centris-review-note">{knownStandardStatuses.has(standard) ? 'Statut Centris à vérifier.' : 'Statut Centris non reconnu à vérifier.'} Le statut du dossier CRM est conservé. Aucune vente ou location n’est finalisée automatiquement.</p>}
    {d ? <>
      <dl className="centris-property-grid">{fields.filter(([,v]) => v !== null && v !== undefined).map(([label,value]) => <div key={String(label)}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <details className="centris-property-more"><summary>Voir plus de caractéristiques</summary><dl className="centris-property-grid">
        {d.above_ground_bedrooms !== null && <div><dt>Chambres hors sol</dt><dd>{d.above_ground_bedrooms}</dd></div>}
        {d.basement_bedrooms !== null && <div><dt>Chambres au sous-sol</dt><dd>{d.basement_bedrooms}</dd></div>}
        {d.property_type && <div><dt>Type Centris</dt><dd>{d.property_type}</dd></div>}
        {d.property_subtype && <div><dt>Sous-type Centris</dt><dd>{subtypeLabel(d.property_subtype)}</dd></div>}
      </dl></details>
      {d.public_remarks && <details className="centris-public-remarks"><summary>Description Centris</summary><p>{d.public_remarks}</p></details>}
    </> : <p className="listing-detail-empty">Les caractéristiques seront disponibles après la prochaine synchronisation Centris.</p>}
  </section>;
}
