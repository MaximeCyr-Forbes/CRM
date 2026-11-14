import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {PropertyAddress,MaterialBadges,BacBadge,inventoryDate} from './presentation';
import type {Assignment} from '../lib/sign-inventory/model';

const row={listing_id:null,transaction_id:null,address:'Adresse actuelle',address_snapshot:'24 Rue Exemple, unité 1, Ville Test',sign_type:'sale',sign_label:'À vendre',has_bac:true,addons:[{id:'addon:sold',label:'Vendu'}],created_at:'2026-10-01T12:00:00Z',returned_at:'2026-11-01T12:00:00Z'} as Assignment;
it('shows an unlinked snapshot without a false link or negative label',()=>{
 const html=renderToStaticMarkup(<PropertyAddress row={row}/>);
 expect(html).toContain(row.address_snapshot);expect(html).not.toContain('<a ');expect(html).not.toContain('Propriété supprimée');
});
it.each([['listing_id','listings'],['transaction_id','transactions']] as const)('preserves %s navigation and current address',(key,path)=>{
 const html=renderToStaticMarkup(<PropertyAddress row={{...row,[key]:'property-id'}}/>);
 expect(html).toContain(`href="/${path}/property-id"`);expect(html).toContain(row.address);
});
it('retains historical snapshot, dates and material without mutating the assignment',()=>{
 const before=JSON.stringify(row);
 expect(renderToStaticMarkup(<PropertyAddress row={{...row,listing_id:'listing-id'}} history/>)).toContain(row.address_snapshot);
 expect(inventoryDate(row.created_at)).toContain('2026');expect(inventoryDate(row.returned_at!)).toContain('2026');
 const html=renderToStaticMarkup(<><MaterialBadges row={row}/><BacBadge present={row.has_bac}/></>);
 expect(html).toContain('À vendre');expect(html).toContain('Vendu');expect(html).toContain('BAC');expect(JSON.stringify(row)).toBe(before);
});
