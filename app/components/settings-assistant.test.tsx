// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsAssistant } from './settings-assistant';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const usage={enabled:false,model:'gpt-6-luna',budget:2,estimated:0,reserved:0,requests:0,cycle:null,financialVerified:false};
it('shows the planned two-dollar budget without claiming activation or official credit balance',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>usage}));render(<SettingsAssistant/>);
 expect(await screen.findByText('Désactivé')).toBeTruthy();expect(screen.getByText('2 USD')).toBeTruthy();
 expect(screen.getByText('Budget maximal prévu — non activé')).toBeTruthy();
 expect(fetch).toHaveBeenCalledTimes(1);expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/assistant/usage');
});
it('separates verified credit evidence from the internal cutoff',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({...usage,cycle:{start:'2026-11-17T16:00:00Z',end:'2026-11-18T23:00:00Z'},creditVerification:{amount:6,at:'2026-11-17T16:00:00Z',until:'2026-11-18T16:00:00Z'}})}));
 render(<SettingsAssistant/>);expect(await screen.findByText('6 USD')).toBeTruthy();
 expect(screen.getByText(/ne représente pas l’heure officielle/)).toBeTruthy();
 expect(screen.getByText('Crédits constatés lors de la vérification')).toBeTruthy();
});
