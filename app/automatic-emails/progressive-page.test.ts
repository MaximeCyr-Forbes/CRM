import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({index:0,values:[] as any[],effects:[] as (()=>unknown)[],error:null as string|null}));
vi.mock("react",async original=>({...await original<typeof import("react")>(),useState:(initial:any)=>{const i=state.index++;if(!(i in state.values))state.values[i]=typeof initial==="function"?initial():initial;return[state.values[i],(value:any)=>state.values[i]=typeof value==="function"?value(state.values[i]):value];},useEffect:(fn:()=>unknown)=>state.effects.push(fn),useMemo:(fn:()=>unknown)=>fn()}));
vi.mock("./use-simulation",()=>({useSimulation:()=>({occurrences:[],preview:null,summary:null,loadingSummary:true,loadingSchedule:false,loadingPreview:false,summaryError:state.error})}));
vi.mock("./birthday-fallback",()=>({BirthdayFallback:()=>null}));
vi.mock("./custom-campaigns-section",()=>({default:()=>null}));
import Page from "./page";
const rule={id:"r",ruleType:"birthday",name:"Bonne fête",status:"draft",executionMode:"approval",defaultBroker:"maxime",subjectTemplate:"Bonjour {{firstName}}",bodyTemplate:"Bonjour {{firstName}}",sendHour:17,sendMinute:0,timezone:"America/Toronto",triggerConfig:{birthdayFallbackEnabled:false}};
function render(){state.index=0;state.effects=[];return Page();}
function button(tree:ReactNode,text:string){let found:any;function walk(node:ReactNode){if(!isValidElement<any>(node))return;const props=node.props as {children?:ReactNode};if(node.type==="button"&&props.children===text)found=props;Children.forEach(props.children,walk);}walk(tree);return found;}
beforeEach(()=>{state.index=0;state.values=[];state.effects=[];state.error=null;vi.stubGlobal("window",{setTimeout:vi.fn()});vi.stubGlobal("fetch",vi.fn(async(url:string)=>({ok:true,json:async()=>url.endsWith("/rules")?{data:{rules:[rule],deliveries:[]}}:{data:rule}})));});
afterEach(()=>vi.unstubAllGlobals());
it("shows cards while simulation is still pending",async()=>{render();state.effects[1]();await vi.waitFor(()=>expect(renderToStaticMarkup(render())).toContain("BONNE FÊTE"));expect(button(render(),"CONFIGURER")).toBeTruthy();expect(renderToStaticMarkup(render())).toContain("Calcul…");expect(fetch).toHaveBeenCalledTimes(1);});
it("simulation failure leaves configuration available",async()=>{render();state.effects[1]();await vi.waitFor(()=>expect(button(render(),"CONFIGURER")).toBeTruthy());state.error="Simulation temporairement indisponible.";expect(button(render(),"CONFIGURER")).toBeTruthy();expect(renderToStaticMarkup(render())).toContain("Simulation temporairement indisponible");});
it("save updates the rule without refetching all rules",async()=>{render();state.effects[1]();await vi.waitFor(()=>expect(button(render(),"CONFIGURER")).toBeTruthy());button(render(),"CONFIGURER").onClick();button(render(),"ENREGISTRER").onClick();await vi.waitFor(()=>expect(button(render(),"ENREGISTRER")).toBeUndefined());expect((fetch as any).mock.calls.map((c:any[])=>c[0])).toEqual(["/api/automatic-emails/rules","/api/automatic-emails/rules/r"]);});
