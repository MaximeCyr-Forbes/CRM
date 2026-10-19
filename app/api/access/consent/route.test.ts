import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({member:vi.fn(),details:vi.fn(),approve:vi.fn()}));
vi.mock('../../../lib/auth/server',()=>({getAuthenticatedMember:mocks.member}));
vi.mock('../../../lib/google-calendar/config',()=>({isSameOriginRequest:()=>true}));
import {GET,POST} from './route';
const id='testauthorization123';
function details(scope:string,userId='user-1'){return {data:{authorization_id:id,user:{id:userId},client:{name:'ChatGPT',uri:'https://chatgpt.com'},scope},error:null};}
beforeEach(()=>{vi.clearAllMocks();mocks.member.mockResolvedValue({member:{authUserId:'user-1',broker:'maxime',role:'admin'},client:{auth:{oauth:{getAuthorizationDetails:mocks.details,approveAuthorization:mocks.approve}}}});mocks.approve.mockResolvedValue({data:{redirect_url:'https://chatgpt.com/connector/oauth/callback'},error:null});});
describe('OAuth consent scope boundary',()=>{
 it('allows ChatGPT identity scopes and refresh access',async()=>{mocks.details.mockResolvedValue(details('openid email offline_access'));expect((await GET(new Request(`https://crm.test/api/access/consent?authorization_id=${id}`))).status).toBe(200);const response=await POST(new Request('https://crm.test/api/access/consent',{method:'POST',body:JSON.stringify({authorization_id:id,decision:'approve'})}));expect(response.status).toBe(200);expect(mocks.approve).toHaveBeenCalledOnce();});
 it.each(['openid https://www.googleapis.com/auth/gmail.send','openid calendar','openid phone'])('rejects unapproved scope %s',async scope=>{mocks.details.mockResolvedValue(details(scope));expect((await GET(new Request(`https://crm.test/api/access/consent?authorization_id=${id}`))).status).toBe(400);expect((await POST(new Request('https://crm.test/api/access/consent',{method:'POST',body:JSON.stringify({authorization_id:id,decision:'approve'})}))).status).toBe(400);expect(mocks.approve).not.toHaveBeenCalled();});
 it('rejects authorization belonging to another member',async()=>{mocks.details.mockResolvedValue(details('openid email offline_access','other-user'));expect((await GET(new Request(`https://crm.test/api/access/consent?authorization_id=${id}`))).status).toBe(400);});
});
