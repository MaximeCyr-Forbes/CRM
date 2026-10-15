import {birthdayWorkspaceActor,requireApiAccess} from '../../../../../lib/crm-access';
import {isSameOriginRequest} from '../../../../../lib/google-calendar/config';
import {DirectClientError} from '../../../../../lib/transactions/direct-clients';
import {sendDirectClientEmail} from '../../../../../lib/transactions/direct-client-email-server';
import {GmailNotEnabledError,GmailSignatureAuthorizationRequiredError,GmailAuthorizationRequiredError,GmailSendError} from '../../../../../lib/google-gmail/service';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request:Request,context:{params:Promise<{transactionId:string}>}){
 const access=await requireApiAccess();if(access.response)return access.response;
 if(!isSameOriginRequest(request))return Response.json({error:'Origine refusée.'},{status:403});
 const actor=await birthdayWorkspaceActor(request);if(!actor)return Response.json({error:'Sélectionnez votre espace utilisateur.'},{status:403});
 try{const body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))throw new TypeError('Requête invalide.');
 return Response.json(await sendDirectClientEmail((await context.params).transactionId,body,actor),{headers:{'Cache-Control':'no-store'}});
 }catch(error){
 if(error instanceof DirectClientError)return Response.json({error:error.message},{status:error.status});
 if(error instanceof TypeError||error instanceof SyntaxError)return Response.json({error:error.message},{status:400});
 if(error instanceof GmailNotEnabledError||error instanceof GmailSignatureAuthorizationRequiredError||error instanceof GmailAuthorizationRequiredError||error instanceof GmailSendError)return Response.json({error:error.message},{status:409});
 return Response.json({error:'Résultat non confirmé. Vérifiez le résultat avec la même demande avant tout nouvel envoi.'},{status:502});
 }
}
