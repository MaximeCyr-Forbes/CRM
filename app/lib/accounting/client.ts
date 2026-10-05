import { invoiceFields } from "./model";
import { workspaceRequest } from "../workspace-request";
export async function accountingRequest(url:string, method="GET", body?:unknown) {
  const init:RequestInit={method,headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})};
  const response=method==="GET" ? await fetch(url,{cache:"no-store"}) : await workspaceRequest(url,init);
  const result=await response.json();
  if(!response.ok) throw new Error(result.error ?? "Opération impossible. Réessayez.");
  return result;
}
export const expenseUrl=(id:string)=>`/api/accounting/expenses/${id}`;
export async function uploadInvoice(id:string,file:File) {
  invoiceFields(file);
  const {documentId,signedUrl}=await accountingRequest(`${expenseUrl(id)}/invoice`,"POST",{action:"prepare",name:file.name,type:file.type,size:file.size});
  const upload=await fetch(signedUrl,{method:"PUT",headers:{"Content-Type":file.type},body:file});
  if(!upload.ok) throw new Error("Envoi de la facture interrompu. Réessayez avec le même fichier.");
  return accountingRequest(`${expenseUrl(id)}/invoice`,"POST",{action:"complete",documentId});
}
