import {describe,it,expect} from 'vitest';
import {balanceAmount,balanceVersion,canEditBalance} from './balances';
describe('Manual balance input',()=>{
 it.each([['500','500.00'],['850,25','850.25'],['-50','-50.00'],['1 250,75','1250.75'],['1\u202f250.75','1250.75'],['0','0.00'],['-0,00','0.00'],['0001.5','1.50'],['9999999999.99','9999999999.99']])('normalizes %s exactly',(value,expected)=>expect(balanceAmount(value)).toBe(expected));
 it.each(['',' ',null,500,NaN,{},'1e3','1.005','1,2,3','--5','10000000000','Infinity','NaN','5 CAD'])('rejects ambiguous/invalid %j',value=>expect(()=>balanceAmount(value)).toThrow());
 it.each([-1,1.5,'0',null,2147483647])('rejects invalid revision %j',value=>expect(()=>balanceVersion(value)).toThrow());
 it('accepts first save and later versions',()=>{expect(balanceVersion(0)).toBe(0);expect(balanceVersion(2)).toBe(2);});
});
describe('Existing workspace permissions',()=>{
 it('broker can edit own balance',()=>expect(canEditBalance('france','france')).toBe(true));
 it('broker can edit another balance',()=>expect(canEditBalance('france','sandrine')).toBe(true));
 it('administrator can edit another balance',()=>expect(canEditBalance('maxime','france')).toBe(true));
 it('accounting assistant can edit balances independently of working broker',()=>expect(canEditBalance('immoplus','sandrine')).toBe(true));
 it('missing actor cannot edit',()=>expect(canEditBalance(null,'france')).toBe(false));
});
