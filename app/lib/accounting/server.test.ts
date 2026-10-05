import { beforeEach,describe,expect,it,vi } from "vitest";
const mock=vi.hoisted(()=>({tables:{} as Record<string,Record<string,unknown>[]>,storage:new Map<string,Blob>(),failRemove:false,seq:0}));
vi.mock("../supabase/server",()=>({getSupabaseAdmin:()=>({
  from:(table:string)=>{
    let action="select",payload:Record<string,unknown>={},filters:((r:Record<string,unknown>)=>boolean)[]=[],single=false,range:[number,number]|undefined;
    const q={select:()=>q,insert:(v:Record<string,unknown>)=>{action="insert";payload=v;return q;},update:(v:Record<string,unknown>)=>{action="update";payload=v;return q;},delete:()=>{action="delete";return q;},eq:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return q;},neq:(k:string,v:unknown)=>{filters.push(r=>r[k]!==v);return q;},lt:(k:string,v:string)=>{filters.push(r=>String(r[k])<v);return q;},or:()=>{filters.push(r=>!r.operation_until||String(r.operation_until)<new Date().toISOString());return q;},order:()=>q,range:(a:number,b:number)=>{range=[a,b];return q;},limit:()=>q,maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},then:(resolve:(v:unknown)=>unknown)=>{
      const all=mock.tables[table]??=[];let rows=all.filter(r=>filters.every(f=>f(r)));
      if(action==="insert"){const r={id:`00000000-0000-4000-8000-${String(++mock.seq).padStart(12,"0")}`,state:"pending",upload_expires_at:new Date(Date.now()+7500000).toISOString(),...payload};all.push(r);rows=[r];}
      if(action==="update")rows.forEach(r=>Object.assign(r,payload));
      if(action==="delete"){mock.tables[table]=all.filter(r=>!rows.includes(r));if(table==="accounting_expenses")mock.tables.accounting_expense_documents?.forEach(d=>{if(rows.some(r=>r.id===d.expense_id))d.expense_id=null;});}
      if(range)rows=rows.slice(range[0],range[1]+1);
      const mapped=rows.map(r=>table==="accounting_expenses"?{...r,accounting_expense_documents:mock.tables.accounting_expense_documents?.filter(d=>d.expense_id===r.id)??[]}:r);
      return Promise.resolve(resolve({data:single?mapped[0]??null:mapped,error:null}));
    }};return q;
  },
  storage:{from:()=>({remove:async(paths:string[])=>{if(mock.failRemove)return{error:new Error("storage")};paths.forEach(p=>mock.storage.delete(p));return{error:null};},download:async(p:string)=>({data:mock.storage.get(p),error:!mock.storage.has(p)}),createSignedUrl:async(p:string,ttl:number)=>({data:{signedUrl:`https://storage.test/${p}?ttl=${ttl}`},error:null}),createSignedUploadUrl:async(p:string)=>({data:{signedUrl:`https://upload.test/${p}`},error:null})})},
  rpc:async(_name:string,p:Record<string,string>)=>{for(const d of mock.tables.accounting_expense_documents??[])if(d.expense_id===p.p_expense){if(d.state==="current")d.state="retired";if(d.id===p.p_document)d.state="current";}return{data:null,error:null};}
})}));
import { completeInvoice,createExpense,deleteExpense,deleteInvoice,getExpense,listExpenses,openInvoice,prepareInvoice,updateExpense } from "./server";
const fields={category:"marketing",expense_date:"2026-10-05",vendor:"QA",description:"Fictive",amount:100};
beforeEach(()=>{mock.tables={};mock.storage.clear();mock.failRemove=false;mock.seq=0;});
async function upload(id:string,name="qa.pdf",type="application/pdf",contents="%PDF-1.7 QA") {
  const blob=new Blob([contents],{type});const prepared=await prepareInvoice(id,{name,type,size:blob.size});const doc=mock.tables.accounting_expense_documents.find(d=>d.id===prepared.documentId)!;mock.storage.set(String(doc.storage_path),blob);return prepared.documentId;
}
describe("Accounting server workflows",()=>{
  it("CRUD uses real actor and shared data",async()=>{const row=await createExpense({...fields,created_by:"maxime",broker:"france"},"immoplus");expect(row.created_by).toBe("immoplus");expect(row).not.toHaveProperty("broker");expect(await listExpenses()).toHaveLength(1);const edited=await updateExpense(row.id,{...fields,amount:"200,50"},"france");expect(edited.amount).toBe(200.5);expect(edited.updated_by).toBe("france");await deleteExpense(row.id);expect(await listExpenses()).toHaveLength(0);});
  it("uploads privately and opens a 60 second signed URL",async()=>{const row=await createExpense(fields,"maxime"),doc=await upload(row.id);const result=await completeInvoice(row.id,doc,"maxime");expect(result.invoice?.file_name).toBe("qa.pdf");expect(await openInvoice(row.id)).toContain("ttl=60");});
  it("replaces invoice and removes old storage object",async()=>{const row=await createExpense(fields,"maxime");await completeInvoice(row.id,await upload(row.id),"maxime");const doc=await upload(row.id,"second.pdf");const result=await completeInvoice(row.id,doc,"immoplus");expect(result.invoice?.file_name).toBe("second.pdf");expect(mock.storage.size).toBe(1);expect(mock.tables.accounting_expense_documents.filter(d=>d.state==="current")).toHaveLength(1);});
  it("retry completion never duplicates invoice",async()=>{const row=await createExpense(fields,"maxime"),doc=await upload(row.id);await completeInvoice(row.id,doc,"maxime");await completeInvoice(row.id,doc,"maxime");expect(mock.storage.size).toBe(1);});
  it("deletes invoice while keeping expense and audit",async()=>{const row=await createExpense(fields,"maxime");await completeInvoice(row.id,await upload(row.id),"maxime");const result=await deleteInvoice(row.id,"immoplus");expect(result.invoice).toBeNull();expect(result.updated_by).toBe("immoplus");expect(mock.storage.size).toBe(0);expect(await listExpenses()).toHaveLength(1);});
  it("deletes expense and its invoice",async()=>{const row=await createExpense(fields,"maxime");await completeInvoice(row.id,await upload(row.id),"maxime");await deleteExpense(row.id);expect(mock.storage.size).toBe(0);expect(await listExpenses()).toHaveLength(0);});
  it("keeps expense and file metadata if storage cleanup fails",async()=>{const row=await createExpense(fields,"maxime");await completeInvoice(row.id,await upload(row.id),"maxime");mock.failRemove=true;await expect(deleteExpense(row.id)).rejects.toThrow("Nettoyage");expect((await getExpense(row.id)).invoice).not.toBeNull();expect(mock.storage.size).toBe(1);});
  it("rejects disguised executable and cleans it",async()=>{const row=await createExpense(fields,"maxime"),doc=await upload(row.id,"fake.pdf","application/pdf","MZ executable");await expect(completeInvoice(row.id,doc,"maxime")).rejects.toThrow("contenu");expect(mock.storage.size).toBe(0);expect((await getExpense(row.id)).invoice).toBeNull();});
  it("missing upload keeps the expense",async()=>{const row=await createExpense(fields,"maxime"),doc=await prepareInvoice(row.id,{name:"qa.pdf",type:"application/pdf",size:10});await expect(completeInvoice(row.id,doc.documentId,"maxime")).rejects.toThrow("non reçue");expect(await getExpense(row.id)).toBeTruthy();});
  it("serializes competing writes",async()=>{const row=await createExpense(fields,"maxime");mock.tables.accounting_expenses[0].operation_until=new Date(Date.now()+60000).toISOString();await expect(deleteExpense(row.id)).rejects.toThrow("en cours");});
});
