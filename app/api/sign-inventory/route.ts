import { withCRMIdentity } from '../../lib/auth/route';
import {inventoryRoute,readInventory,writeInventory} from '../../lib/sign-inventory/server';
export const dynamic='force-dynamic';
async function GETHandler(request:Request){return inventoryRoute(request,()=>readInventory(new URL(request.url).searchParams));}
async function POSTHandler(request:Request){return inventoryRoute(request,async actor=>writeInventory(await request.json().catch(()=>null),actor!));}

export const GET = withCRMIdentity(GETHandler);
export const POST = withCRMIdentity(POSTHandler);