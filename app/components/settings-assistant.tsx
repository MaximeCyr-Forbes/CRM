"use client";
import { useEffect, useState } from 'react';
import './assistant-forbes.css';
type Usage={enabled:boolean;model:string;budget:number;estimated:number;reserved:number;requests:number;cycle:{start:string;end:string}|null;creditVerification?:{amount:number;at:string;until:string}|null;financialVerified:boolean};
const localDate=(value:string)=>new Date(value).toLocaleString('fr-CA',{timeZone:'America/Toronto'});
export function SettingsAssistant(){
 const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState(false);
 useEffect(()=>{const abort=new AbortController();fetch('/api/assistant/usage',{signal:abort.signal,cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();setUsage(await response.json());}).catch(()=>{if(!abort.signal.aborted)setError(true);});return()=>abort.abort();},[]);
 return <section className="assistant-usage" aria-label="Utilisation de l’Assistant Forbes"><h2>ASSISTANT FORBES — UTILISATION</h2>
 {!usage?<p>{error?'Utilisation temporairement indisponible.':'Chargement…'}</p>:<><dl>
 <dt>État</dt><dd>{usage.enabled?'Activé':'Désactivé'}</dd><dt>Modèle</dt><dd>{usage.model}</dd>
 <dt>{usage.cycle?'Budget interne du cycle':'Budget maximal prévu — non activé'}</dt><dd>{usage.budget} USD</dd><dt>Consommation estimée</dt><dd>{usage.estimated.toFixed(4)} USD</dd><dt>Réserves en cours ou incertaines</dt><dd>{usage.reserved.toFixed(4)} USD</dd>
 <dt>Questions dans ce cycle</dt><dd>{usage.requests}</dd><dt>Cycle vérifié</dt><dd>{usage.cycle?`${new Date(usage.cycle.start).toLocaleDateString('fr-CA')} → ${new Date(usage.cycle.end).toLocaleDateString('fr-CA')}`:'Non confirmé'}</dd>
 <dt>Protection financière</dt><dd>{usage.financialVerified?'Conditions vérifiées':'Activation bloquée'}</dd></dl>
 {usage.creditVerification&&<dl><dt>Crédits constatés lors de la vérification</dt><dd>{usage.creditVerification.amount} USD</dd><dt>Vérifiés le (Montréal)</dt><dd>{localDate(usage.creditVerification.at)}</dd><dt>Vérification valide jusqu’au</dt><dd>{localDate(usage.creditVerification.until)}</dd></dl>}
 {usage.cycle&&<p>Coupure interne (Montréal) : {localDate(usage.cycle.end)}. Cette limite conservatrice ne représente pas l’heure officielle d’expiration OpenAI. Une nouvelle vérification est nécessaire pour réactiver le service.</p>}
 <p>Ces estimations internes ne représentent pas le solde officiel OpenAI. Aucun appel IA à l’ouverture de l’assistant. L’activation exige des crédits promotionnels vérifiés, sans facturation payante, et une revue de confidentialité.</p></>}
 </section>;
}
