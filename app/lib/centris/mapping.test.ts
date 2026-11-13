import { expect, it } from 'vitest';
import { discoverMembers, mapProperty, primaryMedia, type MemberMapping, type Property } from './mapping';
const mappings: MemberMapping[] = [{ broker: 'maxime', member_key:'m1',member_mls_id:'1',member_email:'qa@example.test' },
  {broker:'france',member_key:'m2',member_mls_id:'2',member_email:'qa2@example.test'}];
const property: Property = {ListingKey:'key',ListingId:'123',ListAgentKey:'m2',CoListAgentKey:'m1',StreetNumberStart:'10',
 StreetShortName:'Rue Exemple',StreetName:'Exemple',Township:'Ville test',ListPrice:500000,RentPrice:null,
 PropertyType:'Residential',PropertySubType:'Single Family Residence',StandardStatus:'Active',MlsStatus:'Active',
 ModificationTimestamp:'2026-11-13T15:00:00Z',OnMarketTimestamp:'2026-11-01T15:00:00Z'};
it('maps real field semantics, primary broker and stable identity without CRM-owned fields',()=>{
 const mapped=mapProperty(property,mappings);
 expect(mapped.values).toMatchObject({broker:'france',address:'Rue Exemple',askingPrice:500000,purpose:'sale',listingDate:'2026-11-01'});
 expect(mapped.source.key).toBe('key');expect(mapped.eligible).toBe(true);
 for(const key of ['status','generalNotes','ownerContactIds','expirationDate']) expect(mapped.values).not.toHaveProperty(key);
});
it('uses team co-agent only if primary is outside the team',()=>{
 expect(mapProperty({...property,ListAgentKey:'outside'},mappings).values.broker).toBe('maxime');
 expect(()=>mapProperty({...property,ListAgentKey:'outside',CoListAgentKey:''},mappings)).toThrow();
});
it('maps rent and condo without inventing a sale price',()=>{
 expect(mapProperty({...property,PropertyType:'Residential Lease',PropertySubType:'Condominium',ListPrice:null,RentPrice:2000},mappings).values)
 .toMatchObject({purpose:'rental',propertyType:'condo',askingPrice:null,monthlyRent:2000});
});
it('does not bootstrap closed or unknown statuses or ambiguous mandates',()=>{
 expect(mapProperty({...property,StandardStatus:'Closed',MlsStatus:'Sold'},mappings).eligible).toBe(false);
 expect(mapProperty({...property,MlsStatus:'Unknown'},mappings).eligible).toBe(false);
 expect(()=>mapProperty({...property,RentPrice:2000},mappings)).toThrow();
 expect(()=>mapProperty({...property,ListPrice:-1},mappings)).toThrow();
});
it('selects only active official photos deterministically',()=>{
 const photo={MediaKey:'b',MediaCategory:'Photo',MediaStatus:'Active',MediaURL:'https://mediaserver.centris.ca/media.ashx?id=test',Order:2};
 expect(primaryMedia([{...photo,MediaCategory:'VirtualTour',Order:0},{...photo,MediaURL:'https://evil.test/photo',Order:0},photo,{...photo,MediaKey:'a',Order:1}])?.MediaKey).toBe('a');
});
it('discovers exact verified emails, never fuzzy names or ambiguous matches',()=>{
 const member={MemberKey:'m1',MemberMlsId:'1',MemberEmail:'QA@example.test',MemberFullName:'Synthetic',MemberStatus:'Active'};
 expect(discoverMembers([member],[{broker:'maxime',email:'qa@example.test'}]).mappings).toHaveLength(1);
 expect(discoverMembers([member,{...member,MemberKey:'other'}],[{broker:'maxime',email:'qa@example.test'}]).mappings).toHaveLength(0);
 expect(discoverMembers([member],[{broker:'france',email:'no@example.test'}]).mappings).toHaveLength(0);
});
