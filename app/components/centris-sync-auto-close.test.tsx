// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CentrisSync} from './centris-sync';

const status={configured:true,connected:true,automatic:true};
const result={dryRun:false,created:1,updated:2,unchanged:15,errors:0,conflicts:0,skipped:7,warnings:[] as string[],preview:[]};
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
async function setup(outcome=Response.json({data:result})) {
 const onSynced=vi.fn();
 const fetcher=vi.fn(async(_url:string,options?:RequestInit)=>{
  if(options?.method!=='POST')return Response.json({data:status});
  return JSON.parse(String(options.body)).dryRun?Response.json({data:{...result,dryRun:true}}):outcome;
 });
 vi.stubGlobal('fetch',fetcher);
 let mounted:ReturnType<typeof render>;
 await act(async()=>{mounted=render(<CentrisSync onSynced={onSynced}/>);});
 await click('Synchroniser Centris');
 return {onSynced,fetcher,unmount:()=>mounted!.unmount()};
}
async function click(name:string){await act(async()=>{const button=screen.getByRole('button',{name});button.focus();fireEvent.click(button);});}
async function advance(ms:number){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});}
const dialog=()=>screen.queryByRole('dialog',{name:'Synchronisation Centris'});

it('keeps the dry-run open indefinitely before confirmation',async()=>{
 const {onSynced}=await setup();await advance(5000);
 expect(dialog()).not.toBeNull();expect(screen.getByText('Aperçu — aucune donnée modifiée')).toBeTruthy();expect(onSynced).not.toHaveBeenCalled();
});
it.each([
 ['changed',result],
 ['unchanged with seven excluded',{...result,created:0,updated:0,unchanged:18}],
])('closes a successful %s sync after one second and refreshes Listings/status',async(_label,data)=>{
 const {onSynced,fetcher}=await setup(Response.json({data}));
 await click('Confirmer la synchronisation');
 expect(screen.getByText('Synchronisation terminée ✓')).toBeTruthy();
 expect(onSynced).toHaveBeenCalledOnce();
 expect(fetcher.mock.calls.filter(([url])=>url==='/api/listings/centris/status')).toHaveLength(2);
 await advance(999);expect(dialog()).not.toBeNull();
 await advance(1);expect(dialog()).toBeNull();
 expect(document.activeElement).toBe(screen.getByRole('button',{name:'Synchroniser Centris'}));
});
it.each([
 ['API error',()=>Response.json({error:'API indisponible'},{status:503})],
 ['partial failure',()=>Response.json({data:{...result,errors:1}})],
 ['conflict',()=>Response.json({data:{...result,conflicts:1}})],
 ['warning requiring review',()=>Response.json({data:{...result,warnings:['À vérifier']}})],
])('keeps the dialog open for %s',async(_label,response)=>{
 await setup(response());await click('Confirmer la synchronisation');await advance(5000);expect(dialog()).not.toBeNull();
});
it('cancels an old timer when closed and reopened for another preview',async()=>{
 await setup();await click('Confirmer la synchronisation');await advance(500);
 await click('Fermer la synchronisation Centris');await click('Synchroniser Centris');
 await advance(5000);expect(dialog()).not.toBeNull();expect(screen.getByText('Aperçu — aucune donnée modifiée')).toBeTruthy();
});
it('cancels an old timer when a new run starts and never closes during loading',async()=>{
 const {fetcher}=await setup();await click('Confirmer la synchronisation');await advance(500);
 let resolve!:(value:Response)=>void;
 fetcher.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));
 await click('Synchroniser Centris');await advance(5000);expect(dialog()).not.toBeNull();expect(screen.getByText('Vérification Centris…')).toBeTruthy();
 await act(async()=>resolve(Response.json({data:{...result,dryRun:true}})));
 await advance(5000);expect(dialog()).not.toBeNull();
});
it('clears the scheduled close on unmount',async()=>{
 const {unmount}=await setup();await click('Confirmer la synchronisation');
 const clear=vi.spyOn(window,'clearTimeout');
 expect(vi.getTimerCount()).toBeGreaterThan(0);unmount();expect(clear).toHaveBeenCalledOnce();
 await advance(5000);expect(dialog()).toBeNull();
});
