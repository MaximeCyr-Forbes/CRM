import { z } from 'zod';
import { isWorkspaceUser, type WorkspaceUser } from '../workspace';

/** Provisioned server-side; a model must never supply its own identity. */
export type MCPIdentity = {
  userId: string; memberId: string; identityId: string; role: "admin" | "broker"; teamId: string; actor: WorkspaceUser; brokers: string[];
  canWrite: boolean; canReadTeamAccounting: boolean; canManageRecommendations: boolean;
  clientId: string; sessionId: string;
};
export class MCPAccessError extends Error {
  constructor(public code: 'UNAUTHORIZED'|'FORBIDDEN'|'NOT_FOUND'|'INVALID_INPUT'|'RATE_LIMITED'|'CONFLICT', message: string) { super(message); }
}
export const uuid = z.uuid();
export const broker = z.enum(['maxime','france','sandrine']);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}, 'Date inexistante.');
export const pagination = { limit:z.number().int().min(1).max(50).default(20), page:z.number().int().min(0).max(1000).default(0) };
export const search = z.string().trim().min(1).max(160);
export const actionKey = z.uuid().describe('Identifiant unique de cette action. Réutiliser la même clé et les mêmes paramètres lors d’une reprise réseau.');
export function requireWrite(identity:MCPIdentity) {
  if(!identity.canWrite) throw new MCPAccessError('FORBIDDEN','Cette connexion possède uniquement un accès en lecture.');
}
export function requireBroker(identity:MCPIdentity,target:string|null) {
  if(target===null ? !identity.canReadTeamAccounting : !identity.brokers.includes(target)) throw new MCPAccessError('NOT_FOUND','Ressource introuvable ou inaccessible.');
}
export function identityFromMembership(userId:string,clientId:string,sessionId:string,m:Record<string,unknown>):MCPIdentity {
  if(typeof m.member_id!=='string' || typeof m.identity_id!=='string' || m.auth_user_id!==userId || (m.role!=='admin' && m.role!=='broker') || m.active!==true || !isWorkspaceUser(m.actor) || typeof m.team_id!=='string' || !Array.isArray(m.brokers) || !m.brokers.every(b=>broker.safeParse(b).success)) throw new MCPAccessError('FORBIDDEN','Aucun accès CRM n’est attribué à ce compte.');
  return {userId,memberId:m.member_id as string,identityId:m.identity_id as string,role:m.role as "admin" | "broker",clientId,sessionId,teamId:m.team_id,actor:m.actor,brokers:[...m.brokers] as string[],canWrite:m.can_write===true,canReadTeamAccounting:m.can_read_team_accounting===true,canManageRecommendations:m.role==='admin'&&m.can_manage_recommendations===true};
}
export function searchNeedle(value:string) { return value.replace(/[%,()._\\"']/g,' ').trim().slice(0,160); }
export function pageResult<T>(rows:T[],page:number,limit:number) { return {data:rows.slice(0,limit),nextPage:rows.length>limit?page+1:null}; }
