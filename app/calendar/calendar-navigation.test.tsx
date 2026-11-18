// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const navigation=vi.hoisted(()=>({query:'',replace:vi.fn(),push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>navigation,useSearchParams:()=>new URLSearchParams(navigation.query)}));
vi.mock('../broker-context',()=>({useBroker:()=>({selectedBroker:'Maxime',isBrokerReady:true})}));
import CalendarPage from './page';
beforeEach(()=>{navigation.query='';navigation.replace.mockReset();vi.stubGlobal('React',React);vi.stubGlobal('matchMedia',()=>({matches:false}));vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({connections:[]}))));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each(['','mode=personal','mode=unknown','broker=france'])('defaults to personal without changing identity: %s',async query=>{navigation.query=query;render(<CalendarPage/>);expect(screen.getByRole('button',{name:'Mon calendrier'}).getAttribute('aria-pressed')).toBe('true');await waitFor(()=>expect(screen.getByText(/calendrier de Maxime doit être connecté/)).toBeTruthy());});
it('team deep link and a subsequent personal navigation update the mounted page',async()=>{navigation.query='mode=team';const page=render(<CalendarPage/>);expect(screen.getByRole('button',{name:'Équipe'}).getAttribute('aria-pressed')).toBe('true');navigation.query='';page.rerender(<CalendarPage/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Mon calendrier'}).getAttribute('aria-pressed')).toBe('true'));});
it('manual view switches keep controlled URLs aligned with assistant navigation',async()=>{render(<CalendarPage/>);fireEvent.click(screen.getByRole('button',{name:'Équipe'}));expect(navigation.replace).toHaveBeenLastCalledWith('/calendar?mode=team');fireEvent.click(screen.getByRole('button',{name:'Mon calendrier'}));expect(navigation.replace).toHaveBeenLastCalledWith('/calendar');await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1));});
