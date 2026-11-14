// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {CentrisSync} from './centris-sync';
import {SettingsCentris} from './settings-centris';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const history=Array.from({length:11},(_,i)=>({startedAt:`2026-11-${String(13-i).padStart(2,'0')}T12:00:00Z`,status:['success','partial','running','failed'][i%4],source:i%2?'manual':'cron',created:1,updated:2,unchanged:3,changes:4,errors:0}));
const status={configured:true,connected:true,automatic:true,lastSuccessAt:history[0].startedAt,history};
const preview={dryRun:true,created:1,updated:2,unchanged:3,errors:0,conflicts:0,skipped:0,warnings:[],preview:[]};
it('keeps history out of Listings and requires preview then explicit confirmation',async()=>{
 const onSynced=vi.fn();
 const fetcher=vi.fn(async(_url:string,options?:RequestInit)=>Response.json({data:options?.method==='POST'?{...preview,dryRun:JSON.parse(String(options.body)).dryRun}:status}));
 vi.stubGlobal('fetch',fetcher);render(<CentrisSync onSynced={onSynced}/>);
 await screen.findByText(/Centris connecté/);
 expect(screen.queryByText('Historique des synchronisations')).toBeNull();
 expect(screen.queryByRole('button',{name:'Confirmer la synchronisation'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Synchroniser Centris'}));
 await screen.findByText('Aperçu — aucune donnée modifiée');
 const posts=()=>fetcher.mock.calls.filter(([,o])=>o?.method==='POST');
 expect(posts()).toHaveLength(1);expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({dryRun:true});expect(onSynced).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirmer la synchronisation'}));
 await waitFor(()=>expect(onSynced).toHaveBeenCalledOnce());
 expect(posts()).toHaveLength(2);expect(JSON.parse(String(posts()[1][1]?.body))).toEqual({dryRun:false});
});
it('shows the connection and ten most recent runs in Settings using read-only status',async()=>{
 const fetcher=vi.fn(async()=>Response.json({data:status}));vi.stubGlobal('fetch',fetcher);
 const {container}=render(<SettingsCentris/>);await screen.findByText('Centris connecté ✓');
 expect(screen.getByText('Synchronisation automatique aux 12 heures')).toBeTruthy();
 fireEvent.click(screen.getByText('Historique des synchronisations'));
 expect(container.querySelectorAll('li')).toHaveLength(10);
 expect(container.querySelector('time')?.dateTime).toBe(history[0].startedAt);
 expect(container.querySelectorAll('time')[9].dateTime).toBe(history[9].startedAt);
 expect(screen.getAllByText(/1 créés · 2 modifiés · 3 inchangés · 4 changements détectés · 0 erreurs/)).toHaveLength(10);
 expect(screen.getAllByText('Automatique').length).toBeGreaterThan(0);expect(screen.getAllByText('Manuelle').length).toBeGreaterThan(0);
 expect(fetcher).toHaveBeenCalledWith('/api/listings/centris/status',{cache:'no-store'});
});
it('handles unavailable status without claiming a connection',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})));
 render(<SettingsCentris/>);await screen.findByText('État Centris temporairement indisponible.');
 expect(screen.queryByText('Centris connecté ✓')).toBeNull();
});
