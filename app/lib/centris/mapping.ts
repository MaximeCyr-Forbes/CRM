import type { ListingBroker, ListingDraft, ListingPropertyType } from '../../data/listing-types';
export type Member = { MemberKey: string; MemberMlsId: string; MemberEmail: string; MemberFullName: string; MemberStatus: string };
export type MemberMapping = { broker: ListingBroker; member_key: string; member_mls_id: string; member_email: string };
export type Media = { MediaKey?: string; MediaURL?: string; MediaCategory?: string; MediaStatus?: string; Order?: number; ModificationTimestamp?: string };
export type Property = Record<string, unknown> & { ListingKey: string; ListingId: string; Media?: Media[] };
export type Source = { key: string; standard: string; mls: string; modified: string; agent: string; coAgent: string; mediaKey: string | null };
export type MappedProperty = { values: Partial<ListingDraft>; source: Source; image: Media | null; eligible: boolean; warning?: string };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function amount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value); if (!Number.isFinite(n) || n < 0) throw new Error('Prix invalide'); return n;
}
export function discoverMembers(members: Member[], identities: { broker: ListingBroker; email: string }[]) {
  const mappings: MemberMapping[] = []; const warnings: string[] = [];
  for (const broker of ['maxime', 'sandrine', 'france'] as const) {
    const emails = new Set(identities.filter(i => i.broker === broker).map(i => i.email.toLowerCase().trim()));
    const matches = [...new Map(members.filter(m => m.MemberStatus === 'Active' && emails.has(m.MemberEmail?.toLowerCase().trim()))
      .map(m => [m.MemberKey, m])).values()];
    if (matches.length !== 1 || !matches[0].MemberKey || !matches[0].MemberMlsId) {
      warnings.push(`Mapping Centris à confirmer pour ${broker}.`); continue;
    }
    const m = matches[0];
    mappings.push({ broker, member_key: m.MemberKey, member_mls_id: m.MemberMlsId, member_email: m.MemberEmail });
  }
  const duplicate = mappings.some((m, i) => mappings.some((other, j) => i !== j && other.member_key === m.member_key));
  return duplicate ? { mappings: [], warnings: ['Identités Centris ambiguës.'] } : { mappings, warnings };
}
export function primaryMedia(media: Media[] = []): Media | null {
  return media.filter(m => m.MediaCategory === 'Photo' && m.MediaStatus === 'Active' && safeMediaUrl(m.MediaURL))
    .sort((a, b) => (a.Order ?? Infinity) - (b.Order ?? Infinity) || (a.MediaKey ?? '').localeCompare(b.MediaKey ?? ''))[0] ?? null;
}
export function safeMediaUrl(value: unknown) {
  try { const url = new URL(text(value)); return url.protocol === 'https:' && url.hostname === 'mediaserver.centris.ca'
    && url.pathname === '/media.ashx' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function listingUrl(value: unknown) {
  try { const u = new URL(text(value)); return u.protocol === 'https:' && ['passerelle.centris.ca', 'www.centris.ca', 'centris.ca'].includes(u.hostname)
    && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
// Observed official feed: Residential / Residential Lease + Condominium,
// Residential Income + Triplex, Land + Lot, Residential + Single Family Residence / Mobile Home.
export function propertyType(type: string, subtype: string): ListingPropertyType {
  if (subtype === 'Condominium') return 'condo';
  if (type === 'Residential Income') return 'income_property';
  if (type === 'Land') return 'land';
  if (type === 'Residential' || type === 'Residential Lease') return 'residential';
  return 'other';
}
export function mapProperty(p: Property, mappings: MemberMapping[], cities = new Map<string, string>()): MappedProperty {
  const agent = text(p.ListAgentKey), coAgent = text(p.CoListAgentKey);
  const broker = mappings.find(m => m.member_key === agent)?.broker ?? mappings.find(m => m.member_key === coAgent)?.broker;
  if (!broker) throw new Error('Courtier non reconnu');
  const key = text(p.ListingKey), id = text(p.ListingId);
  if (!key || !id || key.length > 175 || id.length > 255) throw new Error('Identité Centris invalide');
  const price = amount(p.ListPrice), rent = amount(p.RentPrice);
  const type = text(p.PropertyType), subtype = text(p.PropertySubType);
  const purpose = type === 'Residential Lease' ? 'rental'
    : price !== null && price > 0 && rent === null ? 'sale'
    : rent !== null && rent > 0 && price === null ? 'rental' : null;
  if (!purpose) throw new Error('Mandat vente/location à confirmer');
  const modified = text(p.ModificationTimestamp);
  if (!modified || !Number.isFinite(Date.parse(modified))) throw new Error('Date source invalide');
  const city = text(p.Township) || cities.get(text(p.CityOrTownshipKey)) || '';
  const address = text(p.StreetShortName) || text(p.StreetName);
  if (!address || !city) throw new Error('Adresse incomplète');
  const standard = text(p.StandardStatus), mls = text(p.MlsStatus);
  // Only this pair is currently observed as commercialized; unknown statuses are not bootstrapped.
  const eligible = standard === 'Active' && mls === 'Active';
  const image = primaryMedia(p.Media);
  const onMarket = text(p.OnMarketTimestamp);
  const date = onMarket && Number.isFinite(Date.parse(onMarket))
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(onMarket)) : null;
  return {
    values: { civicNumber: text(p.StreetNumberStart), address, apartment: text(p.UnitNumber), city,
      province: text(p.StateOrProvince), postalCode: text(p.PostalCode), country: text(p.Country),
      centrisNumber: id, broker, purpose, askingPrice: price, monthlyRent: rent,
      propertyType: propertyType(type, subtype), ...(date ? { listingDate: date } : {}), centrisUrl: listingUrl(p.ListingURL) },
    source: { key, standard, mls, modified, agent, coAgent,
      mediaKey: image ? `${image.MediaKey ?? ''}:${image.ModificationTimestamp ?? ''}:${image.MediaURL}` : null },
    image, eligible, ...(propertyType(type, subtype) === 'other' ? { warning: 'Type de propriété à vérifier.' } : {}),
  };
}
