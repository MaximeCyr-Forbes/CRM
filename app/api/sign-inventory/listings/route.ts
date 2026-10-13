import {inventoryRoute,searchProperties} from '../../../lib/sign-inventory/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){return inventoryRoute(request,()=>searchProperties(new URL(request.url).searchParams.get('search')??''));}
