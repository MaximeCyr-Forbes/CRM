import {it,expect} from 'vitest';
import {groupEmailDocuments,emailTransactionFromAnalysis} from './analysis';
import {document,promise} from '../../oaciq-reader/test-fixtures';
import {analyzeOaciqDocuments} from '../../oaciq-reader';
it('groups linked annexes with their PA regardless of upload order',()=>{
 const pa=promise(),af=document('AF-30003.pdf','ANNEXE F\nAF 30003\nPA 10001');
 expect(groupEmailDocuments([af,pa])).toHaveLength(1);
});
it('keeps separate PAs separate and groups orphan annexes by the common explicit parent',()=>{
 const a=promise(),b=promise({number:'10002'});
 expect(groupEmailDocuments([a,b])).toHaveLength(2);
 const af=document('AF-30003.pdf','ANNEXE F\nAF 30003\nPA 19999');
 const ar=document('AR-30004.pdf','ANNEXE R\nAR 30004\nPA 19999');
 expect(groupEmailDocuments([af,ar])).toHaveLength(1);
});
it('retains separate delivery and review dependencies and excludes the acceptance deadline',async()=>{
 const pa=promise({accepted:false,documents:7,clause12:'La condition de zonage doit être satisfaite dans les 30 jours suivant l’acceptation.'});
 const result=emailTransactionFromAnalysis(await analyzeOaciqDocuments([pa]),[pa]);
 const delivery=result.conditions.find((c:any)=>c.type==='documents_delivery');
 const review=result.conditions.find((c:any)=>c.type==='documents_review');
 expect(review.trigger).toBe('condition:'+delivery.id);expect(review.duration_days).toBe(7);
 expect(result.conditions.some((c:any)=>c.clause==='14.1')).toBe(false);
 expect(result.acceptance.complete).toBe(false);
});
