import { getSupabaseAdmin } from "../supabase/server";
import { renderEmailRecipient } from "../email/template";
import { prepareGmailSender, sendPreparedGmailMessage } from "./service";
import type { CalendarBroker } from "../../data/calendar-types";

async function currentContact(id: string) {
  const {data,error}=await getSupabaseAdmin().from("contacts").select("id,first_name,last_name,email,phone").eq("id",id).maybeSingle();
  if(error)throw error;
  if(!data)throw new TypeError("Contact introuvable.");
  return data as {id:string;first_name:string;last_name:string;email:string|null;phone:string|null};
}
/** The selected workspace remains the sender; the persisted Contact supplies variables. */
export async function sendContactEmail(broker:CalendarBroker, input:{contactId:string;to:string;subject:string;message:string;expectedEmail?:string}) {
  const contact=await currentContact(input.contactId);
  if(input.expectedEmail!==undefined && (contact.email??"").trim().toLowerCase()!==input.expectedEmail.trim().toLowerCase()) throw new TypeError("L’adresse du Contact a changé. Actualisez avant de réessayer.");
  const rendered=renderEmailRecipient(input.subject,input.message,{firstName:contact.first_name,lastName:contact.last_name,email:contact.email||input.to,phone:contact.phone});
  if(rendered.blockingReasons.length)throw new TypeError(rendered.blockingReasons.join(" "));
  const sender=await prepareGmailSender(broker);
  const latest=await currentContact(input.contactId);
  if(JSON.stringify(latest)!==JSON.stringify(contact))throw new TypeError("Le Contact a changé. Actualisez avant de réessayer.");
  // Keep the explicitly editable To field; never silently replace it with an old snapshot.
  return sendPreparedGmailMessage(sender,{to:input.to,subject:rendered.subject,message:rendered.message});
}
