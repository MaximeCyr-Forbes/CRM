// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ListingTransactionAssociation} from './listing-transaction-association';
import {associationView,type AssociationData} from '../lib/listing-associations/server';
const push=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({useRouter:()=>({push})}));
const listing={id:'10000000-0000-4000-8000-000000000001',address:'120 Av. Exemple E., Montréal',city:'Montréal',centris:'12345678',broker:'maxime',status:'active',type:'sale',price:500000,updatedAt:'2026-01-01T00:00:00Z',createdAt:'2026-01-01T00:00:00Z'};
const transaction={...listing,id:'20000000-0000-4000-8000-000000000001',status:'new',price:490000};
let data:AssociationData,fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 data={listings:[listing],transactions:[transaction,{...transaction,id:'20000000-0000-4000-8000-000000000002',status:'cancelled'}],associations:[]};
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 fetcher=vi.fn(async(url:string,options?:RequestInit)=>{
  if(options?.method==='POST'){
   const body=JSON.parse(String(options.body));
   if(body.detachId)data.associations[0]={...data.associations[0],detachedAt:'2026-02-01T00:00:00Z',detachedBy:'maxime',version:2};
   else data.associations.push({id:'association',listingId:listing.id,transactionId:transaction.id,kind:'primary',source:'documentary',version:1,createdAt:listing.createdAt,createdBy:'maxime',detachedAt:null,detachedBy:null});
   return Response.json({data:data.associations[0]});
  }
  const u=new URL(url,'https://crm.test');return Response.json({data:associationView(data,u.searchParams.get('side') as 'listing'|'transaction',u.searchParams.get('id')!,u.searchParams.get('q')??'')});
 });vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
async function mount(side:'listing'|'transaction'='listing'){let r!:ReturnType<typeof render>;await act(async()=>{r=render(<ListingTransactionAssociation side={side} id={side==='listing'?listing.id:transaction.id}/>);});return r;}
async function click(name:string){await act(async()=>fireEvent.click(screen.getByRole('button',{name})));}
const posts=()=>fetcher.mock.calls.filter(([,o])=>(o as RequestInit)?.method==='POST');
it('shows current suggestion before separate cancelled history, without any write',async()=>{
 await mount();expect(screen.getByText('Correspondance recommandée')).toBeTruthy();expect(screen.getByText(/Correspondances historiques/)).toBeTruthy();expect(posts()).toHaveLength(0);
 await click('Rattacher');expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getAllByText(/500.?000/).length).toBeGreaterThan(0);expect(screen.getAllByText(/490.?000/).length).toBeGreaterThan(0);await click('Annuler');expect(posts()).toHaveLength(0);
});
it.each(['listing','transaction'] as const)('confirms once from %s, persists through remount and navigates',async side=>{
 const r=await mount(side);await click('Rattacher');await click('Confirmer le rattachement');expect(posts()).toHaveLength(1);expect(screen.queryByRole('dialog')).toBeNull();r.unmount();await mount(side);await click(side==='listing'?'Ouvrir la Transaction':'Ouvrir le Listing');expect(push).toHaveBeenCalledWith(side==='listing'?`/transactions/${transaction.id}`:`/listings/${listing.id}`);expect(data.associations).toHaveLength(1);
});
it('detaches only after confirmation, keeps audit, and permits correction',async()=>{
 await mount();await click('Rattacher');await click('Confirmer le rattachement');await click('Détacher la Transaction');await click('Confirmer le détachement');expect(data.associations[0].detachedBy).toBe('maxime');expect(screen.getByText(/Historique des détachements/)).toBeTruthy();expect(screen.getByRole('button',{name:'Rattacher'})).toBeTruthy();
});
it('keeps a failed confirmation open and never claims success',async()=>{
 await mount();await click('Rattacher');fetcher.mockImplementationOnce(async()=>Response.json({error:'Les dossiers ont changé.'},{status:409}));await click('Confirmer le rattachement');expect(screen.getByRole('alert').textContent).toContain('ont changé');expect(screen.getByRole('dialog')).toBeTruthy();expect(data.associations).toHaveLength(0);
});
it('prevents double confirmation while pending',async()=>{
 await mount();await click('Rattacher');let resolve!:(r:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;}));
 const b=screen.getByRole('button',{name:'Confirmer le rattachement'});await act(async()=>{fireEvent.click(b);fireEvent.click(b);});expect(posts()).toHaveLength(1);await act(async()=>resolve(Response.json({error:'Réessayer'},{status:503})));expect(data.associations).toHaveLength(0);
});
it('requires acknowledging an apartment conflict',async()=>{
 data.transactions=[{...transaction,unit:'202'}];data.listings=[{...listing,unit:'101'}];await mount();expect(screen.queryByText('Correspondance recommandée')).toBeNull();await click('Rattacher');const d=within(screen.getByRole('dialog'));expect((d.getByRole('button',{name:'Confirmer le rattachement'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(d.getByRole('checkbox'));expect((d.getByRole('button',{name:'Confirmer le rattachement'}) as HTMLButtonElement).disabled).toBe(false);
});
it('manual search uses readable address and does not write',async()=>{
 await mount();await click('Choisir une autre Transaction');fireEvent.change(screen.getByRole('textbox'),{target:{value:'absente'}});await click('Rechercher');expect(screen.getByText(/Aucune correspondance proposée/)).toBeTruthy();expect(posts()).toHaveLength(0);
});
