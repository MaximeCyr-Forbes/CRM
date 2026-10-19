import { withCRMIdentity } from '../../../lib/auth/route';
import {inventoryRoute,searchProperties} from '../../../lib/sign-inventory/server';
export const dynamic='force-dynamic';
async function GETHandler(request:Request){return inventoryRoute(request,()=>searchProperties(new URL(request.url).searchParams.get('search')??''));}

export const GET = withCRMIdentity(GETHandler);