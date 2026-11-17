"use client";
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Plus, Send, X } from 'lucide-react';
import './assistant-forbes.css';
type Turn={question:string;answer:string;links?:{href:string;label:string}[]};
const welcome="Salut ! Je suis l’Assistant Forbes.\n\nJe peux t’aider à retrouver des Contacts, comprendre des Transactions, consulter les Listings et repérer les échéances importantes.\n\nQue veux-tu savoir ?";
export function AssistantForbes({pathname=''}:{pathname?:string}) {
 const [open,setOpen]=useState(false),[question,setQuestion]=useState(''),[turns,setTurns]=useState<Turn[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),controller=useRef<AbortController|null>(null),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 function close(){setOpen(false);trigger.current?.focus();}
 function reset(){generation.current++;controller.current?.abort();setTurns([]);setQuestion('');setError('');setBusy(false);}
 async function send(){
  if(busy||!question.trim())return;
  const current=generation.current,text=question.trim();setBusy(true);setError('');
  const abort=new AbortController();controller.current=abort;
  try{
   const response=await fetch('/api/assistant/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:abort.signal,
    body:JSON.stringify({requestId:crypto.randomUUID(),question:text,history:turns.slice(-4).map(turn=>({question:turn.question,answer:''})),
     ...(/^\/(contacts|listings|transactions)\/[0-9a-f-]{36}$/i.test(pathname)?{context:pathname}:{})})});
   const result=await response.json();if(current!==generation.current)return;
   if(!response.ok)throw new Error(result.error||'Assistant temporairement indisponible.');
   setTurns(items=>[...items,{question:text,answer:result.answer,links:result.links}].slice(-4));setQuestion('');
  }catch(reason){if(current===generation.current&&!abort.signal.aborted)setError(reason instanceof Error?reason.message:'Connexion interrompue.');}
  finally{if(current===generation.current)setBusy(false);}
 }
 return <>
  <button ref={trigger} type="button" className="forbes-assistant-launch" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open}><MessageCircle size={18}/><span>Assistant Forbes</span></button>
  <dialog ref={dialog} className="forbes-assistant-panel" aria-labelledby="assistant-title" onCancel={close} onClick={event=>{if(event.target===event.currentTarget)close();}}>
   <header><div><h2 id="assistant-title">ASSISTANT FORBES</h2><p>Consultation CRM disponible</p><small>IA externe non activée</small></div><button type="button" onClick={close} aria-label="Fermer l’assistant"><X size={20}/></button></header>
   <div className="forbes-assistant-toolbar"><span>Lecture seule</span><button type="button" onClick={reset}><Plus size={15}/>Nouvelle conversation</button></div>
   <div className="forbes-assistant-messages" role="log" aria-live="polite"><p>{welcome}</p>
    {turns.map((turn,index)=><div key={index}><p className="assistant-question">{turn.question}</p><p>{turn.answer}</p>{turn.links?.map(link=><a key={link.href} href={link.href} onClick={close}>{link.label} →</a>)}</div>)}
    {busy&&<p role="status">Recherche en cours…</p>}{error&&<p className="assistant-feedback" role="alert">{error}</p>}
   </div>
   <form onSubmit={event=>{event.preventDefault();void send();}}><label htmlFor="assistant-question">Votre question</label><textarea id="assistant-question" maxLength={600} value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Que souhaitez-vous retrouver ?" rows={3}/><div><small>{question.length}/600 · Historique limité à cette session</small><button type="submit" disabled={busy||!question.trim()} aria-label="Envoyer la question"><Send size={18}/></button></div></form>
  </dialog>
 </>;
}
