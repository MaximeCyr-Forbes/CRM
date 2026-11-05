"use client";
import {useEffect,useRef} from "react";
import {emailToolTemplate} from "../../lib/tools/email/template";
import "./email.css";
export default function EmailGeneratorPage() {
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const root=host.current!;let active=true;let dispose: (()=>void)|undefined;
  root.innerHTML=emailToolTemplate;
  void import("../../lib/tools/email/interface").then(({initializeEmailTool})=>{if(active)dispose=initializeEmailTool(root);});
  return ()=>{active=false;dispose?.();root.replaceChildren();};
 },[]);
 return <div className="forbes-tool-email" ref={host} />;
}
