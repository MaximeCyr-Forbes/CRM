import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({ready:false,effects:[] as (()=>unknown)[]}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),useEffect:(effect:()=>unknown)=>state.effects.push(effect),useState:(value:unknown)=>[value,vi.fn()]}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams('authorization_id=testauthorization123')}));
vi.mock('../../auth-context',()=>({useAuth:()=>({status:'authenticated',member:{broker:'maxime'}})}));
vi.mock('../../broker-context',()=>({useBroker:()=>({isBrokerReady:state.ready})}));
import Page from './page';
beforeEach(()=>{state.ready=false;state.effects=[];vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({clientName:'ChatGPT'})}));});
it('does not consume an OAuth authorization before the broker remount completes',()=>{Page();state.effects.splice(0).forEach(effect=>effect());expect(fetch).not.toHaveBeenCalled();state.ready=true;Page();state.effects.splice(0).forEach(effect=>effect());expect(fetch).toHaveBeenCalledOnce();});
