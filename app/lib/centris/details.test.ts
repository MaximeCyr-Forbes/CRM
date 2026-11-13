import {it,expect} from 'vitest';
import {mapDetails,areaLabel,subtypeLabel} from './details';
it('retains missing values as unknown, actual zero and false as known',()=>{
 const empty=mapDetails({});expect(empty.bedrooms_total).toBeNull();expect(empty.garage).toBeNull();expect(empty.year_built).toBeNull();
 const known=mapDetails({BedroomsTotal:0,GarageYN:false,BathroomsPartial:'0'});expect(known.bedrooms_total).toBe(0);expect(known.garage).toBe(false);expect(known.bathrooms_partial).toBe(0);
});
it('preserves source area units without assuming square feet',()=>{
 expect(areaLabel(72.6,'Square Meters')).toContain('m²');expect(areaLabel(797,'Square Feet')).toContain('pi²');
 expect(areaLabel(12,null)).toContain('unité non renseignée');expect(areaLabel(null,'Square Feet')).toBeNull();expect(areaLabel(12,'Unknown')).toContain('Unknown');
});
it('rejects corrupt numerical characteristics and handles invalid dates safely',()=>{
 for(const value of [-1,'bad',Infinity,true,1.5]) expect(()=>mapDetails({BedroomsTotal:value})).toThrow();
 expect(mapDetails({PriceChangeTimestamp:'invalid'}).price_changed_at).toBeNull();
 expect(subtypeLabel('Future subtype')).toBe('Future subtype');
});
