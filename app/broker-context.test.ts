import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CRMMember } from './lib/auth/identity';
const hooks=vi.hoisted(()=>({index:0, slots:[] as unknown[], dependencies:[] as (unknown[]|undefined)[], effects:[] as (()=>void)[], auth:{status:'loading',member:null as CRMMember|null}}));
vi.mock('./auth-context',()=>({useAuth:()=>hooks.auth}));
vi.mock('react',async original=>{
 const React=await original<typeof import('react')>();
 const changed=(index:number,deps:unknown[])=>!hooks.dependencies[index]||deps.some((value,i)=>!Object.is(value,hooks.dependencies[index]![i]));
 const memo=<T,>(factory:()=>T,deps:unknown[])=>{const index=hooks.index++;if(changed(index,deps)){hooks.slots[index]=factory();hooks.dependencies[index]=deps;}return hooks.slots[index] as T;};
 return {...React,
  useState:(initial:unknown)=>{const index=hooks.index++;if(!(index in hooks.slots))hooks.slots[index]=initial;return [hooks.slots[index],(value:unknown)=>{hooks.slots[index]=value;}];},
  useEffect:(effect:()=>void,deps:unknown[])=>{const index=hooks.index++;if(changed(index,deps)){hooks.effects.push(effect);hooks.dependencies[index]=deps;}},
  useMemo:memo,useCallback:(callback:unknown,deps:unknown[])=>memo(()=>callback,deps),
 };
});
import { BrokerProvider } from './broker-context';
function render(){hooks.index=0;const element=BrokerProvider({children:null});const effects=hooks.effects.splice(0);effects.forEach(effect=>effect());return element.props.value;}
const member:CRMMember={memberId:'m',identityId:'i',authUserId:'u',broker:'maxime',role:'admin',brokers:['maxime','france','sandrine']};
beforeEach(()=>{hooks.index=0;hooks.slots=[];hooks.dependencies=[];hooks.effects=[];hooks.auth={status:'loading',member:null};const data=new Map<string,string>();vi.stubGlobal('window',{sessionStorage:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)}});});
describe('broker session hydration',()=>{
 it('resolves the Google member after the initial asynchronous loading state',()=>{
  expect(render().isBrokerReady).toBe(false);
  hooks.auth={status:'authenticated',member};render();
  const value=render();expect(value.isBrokerReady).toBe(true);expect(value.workspaceUser).toBe('maxime');expect(value.selectedBroker).toBe('Maxime');
 });
 it('keeps the authenticated actor when the admin changes the viewed broker',()=>{
  render();hooks.auth={status:'authenticated',member};render();render().selectWorkspace('france');
  const value=render();expect(value.workspaceUser).toBe('maxime');expect(value.workingBroker).toBe('france');
 });
 it('rejects another broker for a non-admin member',()=>{
  render();hooks.auth={status:'authenticated',member:{...member,broker:'france',role:'broker',brokers:['france']}};render();render().selectBroker('Maxime');
  const value=render();expect(value.workspaceUser).toBe('france');expect(value.workingBroker).toBe('france');
 });
 it('finishes legacy initialization after session loading without inventing a member',()=>{
  render();hooks.auth={status:'authenticated',member:null};render();const value=render();expect(value.isBrokerReady).toBe(true);expect(value.workspaceUser).toBeNull();
 });
});
