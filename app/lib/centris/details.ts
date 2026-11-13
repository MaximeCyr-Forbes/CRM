/** Centris-owned data only; never merged into CRM notes or completion fields. */
export type CentrisPropertyDetails = {
  bedrooms_total: number | null; above_ground_bedrooms: number | null; basement_bedrooms: number | null;
  bathrooms_full: number | null; bathrooms_partial: number | null;
  living_area: number | null; living_area_units: string | null; lot_area: number | null; lot_area_units: string | null;
  year_built: number | null; garage: boolean | null; garage_spaces: number | null; parking_total: number | null;
  property_type: string | null; property_subtype: string | null; public_remarks: string | null;
  price_changed_at: string | null; status_changed_at: string | null;
  last_change_at?: string | null; last_change_kind?: string | null;
};
export const DETAIL_FIELDS = 'BedroomsTotal,AboveGroundBedroomsTotal,BasementBedroomsTotal,BathroomsFull,BathroomsPartial,LivingArea,LivingAreaUnits,LotSizeArea,LotSizeUnits,YearBuilt,GarageYN,GarageSpaces,ParkingTotal,PublicRemarks,PriceChangeTimestamp,StatusChangeTimestamp';
const text = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;
function number(v: unknown, integer = false): number | null {
  if (v == null || v === '') return null;
  if ((typeof v !== 'number' && typeof v !== 'string') || !Number.isFinite(Number(v)) || Number(v) < 0
    || (integer && !Number.isInteger(Number(v)))) throw new Error('Caractéristique numérique invalide');
  return Number(v);
}
function timestamp(v: unknown) { const s = text(v); return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null; }
export function mapDetails(p: Record<string, unknown>): CentrisPropertyDetails {
  return {
    bedrooms_total: number(p.BedroomsTotal, true), above_ground_bedrooms: number(p.AboveGroundBedroomsTotal, true),
    basement_bedrooms: number(p.BasementBedroomsTotal, true), bathrooms_full: number(p.BathroomsFull, true),
    bathrooms_partial: number(p.BathroomsPartial, true), living_area: number(p.LivingArea), living_area_units: text(p.LivingAreaUnits),
    lot_area: number(p.LotSizeArea), lot_area_units: text(p.LotSizeUnits), year_built: number(p.YearBuilt, true),
    garage: typeof p.GarageYN === 'boolean' ? p.GarageYN : null, garage_spaces: number(p.GarageSpaces), parking_total: number(p.ParkingTotal),
    property_type: text(p.PropertyType), property_subtype: text(p.PropertySubType), public_remarks: text(p.PublicRemarks),
    price_changed_at: timestamp(p.PriceChangeTimestamp), status_changed_at: timestamp(p.StatusChangeTimestamp),
  };
}
export function areaLabel(value: number | null, unit: string | null) {
  if (value === null) return null;
  const units: Record<string,string> = { 'Square Meters': 'm²', 'Square Feet': 'pi²', Acres: 'acres', Hectares: 'ha' };
  return `${value.toLocaleString('fr-CA')} ${unit ? units[unit] ?? unit : '(unité non renseignée)'}`;
}
export function subtypeLabel(value: string | null) {
  const labels: Record<string,string> = { Condominium: 'Copropriété', 'Single Family Residence': 'Maison unifamiliale', Triplex: 'Triplex', Lot: 'Terrain', 'Mobile Home': 'Maison mobile' };
  return value ? labels[value] ?? value : null;
}
export const knownStandardStatuses = new Set(['Active','Active Under Contract','Pending','Closed','Expired','Withdrawn','Canceled','Coming Soon','Hold','Delete','Incomplete']);
