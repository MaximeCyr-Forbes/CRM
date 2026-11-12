// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {TransactionAgenda} from './transaction-agenda';
import type {TransactionDeadline} from '../data/transaction-types';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps the checkbox unchanged on failure, disables pending input and shows the server error',async()=>{
 vi.stubGlobal('React',React);
 let reject!:(error:Error)=>void;
 const onComplete=vi.fn(()=>new Promise((_,r)=>{reject=r;}));
 const deadline={id:'qa',title:'QA',dueDate:'2026-11-13',completed:false,googleCalendarEventId:'event',googleCalendarSyncStatus:'synced'} as TransactionDeadline;
 const props={deadlines:[deadline],disabled:false,onAdd:vi.fn(),onEdit:vi.fn(),onComplete,onDelete:vi.fn(),onSync:vi.fn()};
 const view=render(<TransactionAgenda {...props}/>);
 fireEvent.click(screen.getByRole('checkbox'));
 expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
 reject(new Error('Impossible de retirer cette échéance de Google Agenda.'));
 await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Impossible de retirer'));
 expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
 expect(onComplete).toHaveBeenCalledOnce();
 view.rerender(<TransactionAgenda {...props} deadlines={[{...deadline,completed:true,googleCalendarEventId:null}]}/>);
 expect(screen.getByText('Retiré de Google Agenda')).toBeTruthy();
 expect(screen.queryByText('Google Agenda · Synchronisé')).toBeNull();
});
