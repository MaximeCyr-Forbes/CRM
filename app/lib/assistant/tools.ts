import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CRMMember } from '../auth/identity';
import { crmMemberContext } from '../auth/context';
import { withSupabaseClient } from '../supabase/request-context';
import { readTools } from '../mcp/read-tools';
import type { MCPIdentity } from '../mcp/access';
import { queryTools } from './query-tools';

export const TOOL_NAMES = [
  'crm_get_listing_transactions','crm_get_listing_visits','crm_get_listing_offers','crm_get_listing_signs',
  'crm_count_records',
  'crm_get_contact_transactions','crm_get_transaction_contacts','crm_get_transaction_documents',
  'crm_query_accounting',
  'crm_search','crm_search_contacts','crm_get_contact','crm_search_listings','crm_get_listing',
  'crm_search_transactions','crm_get_transaction','crm_get_transaction_timeline',
  'crm_get_upcoming_deadlines','crm_get_sign_inventory','crm_get_mortgage_referrals','crm_get_accounting_summary',
  'crm_get_contact_listings','crm_get_active_broker_listings','crm_get_active_broker_transactions',
  'crm_get_listing_owners','crm_get_broker_listings','crm_get_due_contact_followups','crm_get_private_deadlines',
] as const;
const allowed = [...readTools, ...queryTools].filter(tool => TOOL_NAMES.some(name => name === tool.name) && !tool.write);
export const definitions = allowed.map(tool => ({ type: 'function', name: tool.name,
  description: tool.description, parameters: z.toJSONSchema(tool.schema, { io: 'input' }), strict: false }));
export type VerifiedLink = { href: string; label: string };
const fields = new Set(['ambiguous','visit_date','visit_time','offer_date','interest_level','has_bac','returned_at','folder_name','explanation','vendor','description','assigned_broker','category','expense_date','created_at','is_paid','invoice_uploaded_at','id','first_name','last_name','phone','email','broker','address','city','civic_number','postal_code',
  'client_provenance','status','type','purpose','price','asking_price','monthly_rent','centris_number','centrisNumber','askingPrice','monthlyRent',
  'centrisStandardStatus','centrisMlsStatus','notary_date','promise_date','notaryDate','promiseDate','notes','content',
  'deadlines','title','due_date','due_time','completed','transaction_id','label','date','time','source','form','confidence',
  'data','contacts','transactions','listings','nextPage','total','marketing','operation','paid','unpaid','amount','truncated','displayStatus','centris_standard_status','centris_mls_status',
  'available','used','quantity','assigned','stock_id','sign_type','kind','name','paid_at','paid_amount','received_amount','payment_status',
  'civicNumber','dueDate','dueTime','transactionId','soldPrice','saleFinalizedAt','purchaseFinalizedAt','mortgage_advisor_name','institution_name','next_follow_up_date','sourceListing','listingId']);
/** Bounded PRIVATE server projection. This is never a provider payload. */
export function minimize(value: unknown, depth = 0): unknown {
  if (depth > 4) return undefined;
  if (typeof value === 'string') return value.slice(0,400);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0,5).map(item => minimize(item,depth+1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key])=>fields.has(key)).map(([key,item])=>[key,minimize(item,depth+1)]));
  return undefined;
}
export function verifiedLinks(name: string, result: unknown): VerifiedLink[] {
  if(['crm_get_listing_visits','crm_get_listing_offers','crm_get_listing_signs','crm_get_transaction_documents'].includes(name))return [];
  if(name==='crm_query_accounting')return [{href:'/accounting',label:'Ouvrir Comptabilité'}];
  const links: VerifiedLink[]=[];
  function collect(value: unknown, section: string) {
    if (Array.isArray(value)) { value.slice(0,5).forEach(row=>collect(row,section)); return; }
    if (!value || typeof value!=='object') return;
    const row=value as Record<string,unknown>;
    if (z.uuid().safeParse(row.id).success && ['contacts','listings','transactions'].includes(section))
      links.push({href:`/${section}/${row.id}`,label:String(row.address || [row.first_name,row.last_name].filter(Boolean).join(' ') || 'Ouvrir la fiche').slice(0,100)});
    for (const key of ['data','contacts','listings','transactions']) if (row[key]) collect(row[key],key==='data'?section:key);
  }
  const section=name.includes('contact')?'contacts':name.includes('listing')?'listings':name==='crm_get_transaction'||name==='crm_search_transactions'?'transactions':'';
  collect(result,section);
  return [...new Map(links.map(link=>[link.href,link])).values()].slice(0,10);
}
export async function runReadTool(name: string, input: unknown, client: SupabaseClient, member: CRMMember) {
  const tool=allowed.find(item=>item.name===name);
  if (!tool) throw new Error('ASSISTANT_TOOL_FORBIDDEN');
  const args=tool.schema.parse(input);
  if ('limit' in args) args.limit=Math.min(Number(args.limit),5);
  if ('page' in args && args.page!==0) throw new Error('ASSISTANT_PAGINATION_LIMIT');
  // The authenticated CRM membership grants shared functional access. Selection in the UI is never identity.
  const identity:MCPIdentity={userId:member.authUserId,memberId:member.memberId,identityId:member.identityId,
    role:member.role,actor:member.broker,brokers:member.brokers,teamId:'crm',clientId:'assistant',sessionId:'current-crm-session',
    canWrite:false,canReadTeamAccounting:true,canManageRecommendations:false};
  const raw=await crmMemberContext.run(member,()=>withSupabaseClient(client,()=>tool.run(args,client,identity)));
  const data=minimize(raw);
  const truncated=(value:unknown,depth=0):boolean=>depth<5&&(Array.isArray(value)?value.length>5||value.some(v=>truncated(v,depth+1)):!!value&&typeof value==='object'&&Object.entries(value).some(([key,v])=>fields.has(key)&&truncated(v,depth+1)));
  return { data:truncated(raw)&&data&&typeof data==='object'&&!Array.isArray(data)?{...data,truncated:true}:data, links:verifiedLinks(name,raw) };
}
