import { birthdayWorkspaceActor, requireApiAccess } from "../crm-access";
import { AccountingError } from "./model";
import type { WorkspaceUser } from "../workspace";
export async function accountingRoute(request: Request, action: (actor: WorkspaceUser | null) => Promise<Response>) {
  const access=await requireApiAccess();
  if(access.response) return access.response;
  try {
    let actor: WorkspaceUser | null=null;
    if(request.method!=="GET") {
      if(request.headers.get("origin")!==new URL(request.url).origin) throw new AccountingError("Origine refusée.",403);
      actor=await birthdayWorkspaceActor(request);
      if(!actor) throw new AccountingError("Sélectionnez votre espace utilisateur pour enregistrer cette opération.",403);
    }
    const response=await action(actor);
    response.headers.set("Cache-Control","private, no-store");
    return response;
  } catch(error) {
    if(!(error instanceof AccountingError)) console.error("Accounting operation failed",{code:(error as {code?:string})?.code});
    return Response.json({error:error instanceof AccountingError ? error.message : "Opération comptable impossible. Réessayez ; les données déjà enregistrées sont conservées."},{status:error instanceof AccountingError ? error.status : 502,headers:{"Cache-Control":"private, no-store"}});
  }
}
export async function accountingBody(request: Request) {
  const body: unknown=await request.json().catch(()=>null);
  if(!body || typeof body!=="object" || Array.isArray(body)) throw new AccountingError("Requête invalide.");
  return body as Record<string,unknown>;
}
