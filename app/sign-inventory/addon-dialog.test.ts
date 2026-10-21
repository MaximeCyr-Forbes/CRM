import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AddonDialog,addonEdit} from './addon-dialog';
import {mutation,type Assignment,type InventoryData} from '../lib/sign-inventory/model';
const row:Assignment={id:'11111111-1111-4111-8111-111111111111',listing_id:'22222222-2222-4222-8222-222222222222',address:'Synthetic property',address_snapshot:'Synthetic property',broker:'france',broker_label:'France',sign_type:'sale',sign_label:'À vendre',has_bac:true,addons:[{id:'addon:estimate',label:'Estimation gratuite'}],version:3,created_at:'',created_by:'',updated_at:'',updated_by:'',returned_at:null,returned_by:null};
const data:InventoryData={types:[],assignments:{data:[row],count:1},stock:[{id:'sign:france',kind:'sign',broker:'france',label:'France',total:1,used:1,available:0,version:1},{id:'addon:sold',kind:'addon',broker:null,label:'Vendu',total:1,used:0,available:1,version:1},{id:'addon:estimate',kind:'addon',broker:null,label:'Estimation gratuite',total:1,used:1,available:0,version:1}]};
const render=(r=row,d=data)=>renderToStaticMarkup(createElement(AddonDialog,{row:r,data:d,onClose:()=>{},onSaved:()=>{}}));
it('edits same assignment and preserves sign, broker, BAC and other addons',()=>{
 const edit=addonEdit(row,['addon:sold']);
 expect(edit).toEqual({action:'edit',id:row.id,version:3,listing_id:row.listing_id,broker:'france',sign_type:'sale',has_bac:true,addons:['addon:estimate','addon:sold']});
 expect(mutation(edit).action).toBe('edit');
});
it('does not duplicate an already associated addon',()=>expect(addonEdit(row,['addon:estimate','addon:sold','addon:sold']).addons).toEqual(['addon:estimate','addon:sold']));
it('supports a transaction-only property without a fake listing',()=>{
 const edit=addonEdit({...row,listing_id:null,transaction_id:row.listing_id},['addon:sold']);
 expect(mutation(edit).data).toMatchObject({listing_id:null,transaction_id:row.listing_id});
});
it('rejects ambiguous listing plus transaction identity',()=>expect(()=>mutation({...addonEdit(row,[]),transaction_id:row.listing_id})).toThrow());
it('allows addon selection on existing sign even with no spare signs',()=>{
 const html=render();expect(html).toContain('Vendu');expect(html).toContain('1 disponible(s)');expect(html).not.toContain('Aucune pancarte disponible');
});
it('marks existing addons as already associated',()=>{const html=render();expect(html).toContain('Déjà associé');expect(html).toContain('disabled="" checked=""');});
it('explains addon stock exhaustion',()=>expect(render(row,{...data,stock:data.stock.map(s=>s.kind==='addon'?{...s,available:0}:s)})).toContain('disponible à l’entrepôt.'));
it('explains and blocks BAC-only demand when no physical sign available',()=>{
 const html=render({...row,sign_type:null,addons:[]});expect(html).toContain('mobilisera aussi une pancarte');expect(html).toContain('Aucune pancarte disponible pour ce courtier.');
});
