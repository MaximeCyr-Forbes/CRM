"use client";
import {useEffect,useRef,type ReactNode} from 'react';
export function InventoryDialog({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=ref.current!,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;el.showModal();document.body.style.overflow='hidden';return()=>{el.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
 return <dialog ref={ref} className="sign-dialog" aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy)onClose();}}}>
  <header><h2>{title}</h2><button type="button" aria-label="Fermer" disabled={busy} onClick={onClose}>×</button></header>{children}
 </dialog>;
}
