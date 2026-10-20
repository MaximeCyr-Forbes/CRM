import {it,expect} from 'vitest';
import {mutation,canManageStock,requiresPhysicalSign} from './model';
it.each([
 [null,[],false],['sale',[],true],
 ...['estimate','sold','open-house','rent'].map(id=>[null,[id],true]),
 ['sale',['estimate','sold'],true],[null,['estimate','sold'],true],
] as [string|null,string[],boolean][])('physical sign demand: %s / %j', (type,addons,expected)=>{
 expect(requiresPhysicalSign(type,addons)).toBe(expected);
});
const base={action:'assign',id:'11111111-1111-4111-8111-111111111111',listing_id:'22222222-2222-4222-8222-222222222222',broker:'broker_a',sign_type:'sale',has_bac:true,addons:['addon:sold']};
it('accepts a real listing identity and separate addons',()=>expect(mutation(base).data).toMatchObject({listing_id:base.listing_id,sign_type:'sale',addons:['addon:sold']}));
it('does not pass forged audit actors to the database',()=>expect(mutation({...base,created_by:'forged'}).data).not.toHaveProperty('created_by'));
it('supports lockbox only',()=>expect(mutation({...base,sign_type:null,addons:[]}).data).toMatchObject({has_bac:true,sign_type:null}));
it.each([-1,1.5,100001,'5',NaN])('rejects invalid total %s',total=>expect(()=>mutation({action:'stock',id:'bac',version:0,total})).toThrow());
it('rejects duplicate addons',()=>expect(()=>mutation({...base,addons:['addon:sold','addon:sold']})).toThrow());
it('rejects empty material',()=>expect(()=>mutation({...base,sign_type:null,addons:[],has_bac:false})).toThrow());
it('rejects an address in place of a listing id',()=>expect(()=>mutation({...base,listing_id:'Synthetic street'})).toThrow());
it.each([null,[],{}, {action:'delete'}])('rejects malformed request',input=>expect(()=>mutation(input)).toThrow());
it('requires a version for editing',()=>expect(()=>mutation({...base,action:'edit'})).toThrow());
it('allows all signed workspace members to edit stock',()=>{expect(canManageStock(null)).toBe(false);expect(canManageStock('france')).toBe(true);expect(canManageStock('immoplus')).toBe(true);expect(canManageStock('maxime')).toBe(true);});
