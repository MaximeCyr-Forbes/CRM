import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ index:0, values:[] as any[], effects:[] as { deps: unknown[]; cleanup?:()=>void }[], pending:[] as (()=>void)[] }));
vi.mock("react",()=>({
  useState:(initial:unknown)=>{const i=state.index++; if(!(i in state.values))state.values[i]=initial;return [state.values[i],(value:any)=>{state.values[i]=typeof value==="function"?value(state.values[i]):value;}];},
  useRef:(initial:unknown)=>{const i=state.index++;return state.values[i]??=( {current:initial} );},
  useEffect:(effect:()=>()=>void,deps:unknown[])=>{const i=state.index++;const old=state.effects[i];if(!old||deps.some((d,j)=>d!==old.deps[j])) {state.pending.push(()=>{old?.cleanup?.();state.effects[i]={deps,cleanup:effect()};});}},
}));
import { useSimulation } from "./use-simulation";
let requests:{url:string;signal:AbortSignal;resolve:(value:unknown)=>void;reject:(reason:Error)=>void}[];
function render(schedule=false,preview:string|null=null,revision=0,ready=true){state.index=0;const result=useSimulation("2026-09-22","2026-10-22",revision,ready,schedule,preview);state.pending.splice(0).forEach(fn=>fn());return result;}
function answer(index:number,data:unknown){requests[index].resolve({ok:true,json:async()=>({data})});}
beforeEach(()=>{state.index=0;state.values=[];state.effects=[];state.pending=[];requests=[];vi.stubGlobal("fetch",vi.fn((url:string,options:{signal:AbortSignal})=>new Promise((resolve,reject)=>requests.push({url,signal:options.signal,resolve,reject}))));});
afterEach(()=>{state.effects.forEach(e=>e?.cleanup?.());vi.unstubAllGlobals();});
it("waits for rules then requests only summary, without render loops",()=>{render(false,null,0,false);expect(requests).toHaveLength(0);render();render();expect(requests).toHaveLength(1);expect(requests[0].url).toContain("mode=summary");});
it("loads schedule only on demand and aborts when closed",()=>{render();render(true);expect(requests[1].url).toContain("mode=full");render(false);expect(requests[1].signal.aborted).toBe(true);});
it("preview targets one rule and cancels stale previews",()=>{render(false,"one");expect(requests[1].url).toContain("mode=preview&ruleId=one");render(false,"two");expect(requests[1].signal.aborted).toBe(true);expect(requests[2].url).toContain("ruleId=two");});
it("keeps simulation errors isolated and permits a new request",async()=>{render();requests[0].reject(new Error("Simulation temporairement indisponible."));await vi.waitFor(()=>expect(render().summaryError).toContain("indisponible"));render(true);expect(requests[1].url).toContain("mode=full");});
it("reuses recent schedule and invalidates after save",async()=>{render(true);answer(1,{occurrences:[]});await vi.waitFor(()=>expect(render(true).loadingSchedule).toBe(false));render(false);render(true);expect(requests).toHaveLength(2);render(true,null,1);expect(requests).toHaveLength(4);});
