import {describe,it,expect} from 'vitest';
import {mergeVisualReview} from './visual-review';
const base=()=>({id:'qa',main_form:'PA-10001',acceptance:{action:'unknown',confidence:0},conditions:[],issues:[],amendments:[],overrides:[],terms:{},events:{},documents:[]});
const doc={form_id:'PA-10001',file_name:'synthetic.pdf'};
const condition={id:'zone',type:'other',label:'Zonage',clause:'12.1',source_page:1,text:'30 jours suivant acceptation',confidence:1,active:true,trigger:'acceptance',duration_days:30};
describe('bounded visual fallback',()=>{
 it('keeps evidenced relative conditions without inventing acceptance',()=>{
  const result=mergeVisualReview(base(),doc,{conditions:[condition]},[1]);
  expect(result.conditions[0]).toMatchObject({duration_days:30,date:null,status:'pending'});expect(result.acceptance.complete).toBe(false);
 });
 it('rejects proof attributed to a page not supplied',()=>{expect(mergeVisualReview(base(),doc,{conditions:[condition]},[2]).conditions).toHaveLength(0);});
 it('does not let empty optional fields generate deadlines',()=>{const r=mergeVisualReview(base(),doc,{conditions:[{...condition,activation:'empty'}]},[1]);expect(r.deadlines).toHaveLength(0);});
 it('keeps excluded clauses excluded',()=>{const r=mergeVisualReview(base(),doc,{conditions:[{...condition,clause:'5.2'}]},[1]);expect(r.conditions).toHaveLength(0);});
 it('never applies an unsigned modification',()=>{const r=mergeVisualReview(base(),{form_id:'MO-20002'}, {conditions:[condition]},[1]);expect(r.conditions).toHaveLength(0);expect(r.issues.join(' ')).toContain('signatures');});
 it('preserves contradictory native values for explicit review',()=>{
  const tx=base() as any;tx.conditions=[{...condition,id:'native',duration_days:10,source:{source_form:'PA-10001'}}];
  const r=mergeVisualReview(tx,doc,{conditions:[condition]},[1]);expect(r.conditions[0].duration_days).toBe(10);expect(r.issues.join(' ')).toContain('contradictoires');
 });
 it('refuses mismatched form identities',()=>{const r=mergeVisualReview(base(),doc,{number:'99999',conditions:[condition]},[1]);expect(r.conditions).toHaveLength(0);});
});
