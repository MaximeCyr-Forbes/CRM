import {describe,expect,it} from 'vitest';
import {bearerToken} from './auth';
describe('MCP bearer authentication',()=>{
 it.each([undefined,'','Basic abc','Bearer','Bearer a b','Bearer '+ 'x'.repeat(8200)])('rejects missing or malformed authorization %#',value=>{
  const headers: Record<string,string>=value===undefined?{}:{authorization:value};
  expect(()=>bearerToken(new Request('https://crm.test/api/mcp',{headers}))).toThrow();
 });
 it('does not accept a token in the URL',()=>expect(()=>bearerToken(new Request('https://crm.test/api/mcp?token=abc'))).toThrow());
 it('reads only a bearer header',()=>expect(bearerToken(new Request('https://crm.test/api/mcp',{headers:{authorization:'Bearer a.b.c'}}))).toBe('a.b.c'));
});
