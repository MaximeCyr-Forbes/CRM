import {inventoryRoute,readInventory,writeInventory} from '../../lib/sign-inventory/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){return inventoryRoute(request,()=>readInventory(new URL(request.url).searchParams));}
export async function POST(request:Request){return inventoryRoute(request,async actor=>writeInventory(await request.json().catch(()=>null),actor!));}
