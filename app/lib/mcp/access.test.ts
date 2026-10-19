import {describe,expect,it} from 'vitest';
import {z} from 'zod';
import {date,identityFromMembership,pagination,requireBroker,requireWrite,searchNeedle} from './access';
const membership={member_id:'member-france',identity_id:'identity-france',auth_user_id:'verified-user',role:'broker',active:true,actor:'france',team_id:'team-forbes',brokers:['france'],can_write:false};
const identity=()=>identityFromMembership('verified-user','verified-client','verified-session',membership);
describe('MCP access boundary',()=>{
 it('derives identity from membership',()=>expect(identity()).toMatchObject({actor:'france',brokers:['france'],canWrite:false,canManageRecommendations:false}));
 it('rejects another broker even with a known ID',()=>{expect(()=>requireBroker(identity(),'maxime')).toThrow('inaccessible');expect(()=>requireBroker(identity(),'france')).not.toThrow();});
 it('rejects team accounting without a grant',()=>expect(()=>requireBroker(identity(),null)).toThrow());
 it('rejects writes for read-only identity',()=>expect(()=>requireWrite(identity())).toThrow('lecture'));
 it.each([{...membership,active:false},{...membership,actor:'admin'},{...membership,brokers:['other']}])('rejects invalid membership %#',m=>expect(()=>identityFromMembership('verified-user','c','s',m)).toThrow());
 it('does not infer admin from a claimed grant',()=>expect(identityFromMembership('verified-user','c','s',{...membership,can_manage_recommendations:true}).canManageRecommendations).toBe(false));
 it.each(['2026-02-30','2026-13-01','October 18, 2026','2026-10-18T00:00:00Z'])('rejects invalid date %s',v=>expect(date.safeParse(v).success).toBe(false));
 it('accepts leap day',()=>expect(date.parse('2028-02-29')).toBe('2028-02-29'));
 it.each([{limit:20000},{page:-1},{page:1001},{user_id:'other'},{workspace_id:'other'}])('rejects unbounded or identity inputs %#',input=>expect(z.strictObject(pagination).safeParse(input).success).toBe(false));
 it('escapes search filter syntax',()=>expect(searchNeedle('Jean%,broker.eq.maxime')).toBe('Jean  broker eq maxime'));
});
