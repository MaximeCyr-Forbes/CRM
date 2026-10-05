import { describe,it,expect } from "vitest";
import { expenseFields,invoiceFields,matchesSignature,filterExpenses,expenseTotals,todayToronto,MAX_INVOICE_SIZE,money,type Expense } from "./model";
const input={category:"marketing",expense_date:"2026-10-05",vendor:"QA fournisseur",description:"Facture fictive",amount:"125,50",notes:"QA"};
describe("Accounting validation",()=>{
  it.each(["125", "125.50","125,50",0])("accepts monetary entry %s",amount=>expect(expenseFields({...input,amount}).amount).toBe(Number(String(amount).replace(",","."))));
  it.each([-1,"1e3","NaN","12.345","99999999999","1,2,3"])("rejects invalid amount %s",amount=>expect(()=>expenseFields({...input,amount})).toThrow());
  it.each([{category:"other"},{expense_date:"2026-02-30"},{notes:"x".repeat(5001)}])("rejects invalid fields %j",bad=>expect(()=>expenseFields({...input,...bad})).toThrow());
  it("does not accept client audit or broker values",()=>expect(expenseFields({...input,created_by:"admin",broker:"immoplus"})).not.toHaveProperty("broker"));
  it.each([["a.pdf","application/pdf"],["a.JPG","image/jpeg"],["a.png","image/png"],["a.webp","image/webp"]])("accepts invoice %s",(name,type)=>expect(invoiceFields({name,type,size:MAX_INVOICE_SIZE}).mime_type).toBe(type));
  it.each([{name:"a.exe",type:"application/pdf",size:10},{name:"a.pdf",type:"image/png",size:10},{name:"a.pdf",type:"application/pdf",size:MAX_INVOICE_SIZE+1},{name:"a.pdf",type:"application/pdf",size:0}])("rejects unsafe invoice %j",file=>expect(()=>invoiceFields(file)).toThrow());
  it("checks actual magic bytes",()=>{expect(matchesSignature(new TextEncoder().encode("%PDF-1.7"),"application/pdf")).toBe(true);expect(matchesSignature(new TextEncoder().encode("MZ executable"),"application/pdf")).toBe(false);expect(matchesSignature(new Uint8Array([137,80,78,71,13,10,26,10]),"image/png")).toBe(true);});
  it("uses Toronto day at UTC midnight",()=>expect(todayToronto(new Date("2026-10-06T01:00:00Z"))).toBe("2026-10-05"));
});
describe("Shared ledger filters",()=>{
  const rows=[{id:"a",...input,amount:100,is_paid:false,paid_at:null,renewal_date:null,created_at:"2026-10-05",invoice:null},{id:"b",...input,amount:200,is_paid:true,paid_at:"2026-10-06",renewal_date:null,created_at:"2026-10-06",invoice:{file_name:"campaign.pdf"}},{id:"c",...input,category:"operation",amount:50,created_at:"2026-10-05",invoice:null},{id:"d",...input,expense_date:"2025-10-05",amount:800,created_at:"2025-10-05",invoice:null}] as Expense[];
  const filters={category:"all",period:"month",year:"2026",search:""} as const;
  it("totals 350 / 300 / 50",()=>expect(expenseTotals(filterExpenses(rows,filters,"2026-10-05"))).toEqual({total:350,marketing:300,operation:50}));
  it("orders date then creation descending",()=>expect(filterExpenses(rows,filters,"2026-10-05").map(r=>r.id)).toEqual(["b","a","c"]));
  it("filters category",()=>expect(filterExpenses(rows,{...filters,category:"operation"},"2026-10-05")).toHaveLength(1));
  it("filters selected year",()=>expect(filterExpenses(rows,{...filters,period:"year",year:"2025"})).toHaveLength(1));
  it("all periods includes previous years",()=>expect(filterExpenses(rows,{...filters,period:"all"})).toHaveLength(4));
  it("searches invoice names without downloading files",()=>expect(filterExpenses(rows,{...filters,search:"CAMPAIGN"},"2026-10-05")).toHaveLength(1));
  it("searches notes",()=>expect(filterExpenses(rows,{...filters,search:"qa"},"2026-10-05")).toHaveLength(3));
});

describe("Optional accounting fields",()=>{
  it.each([{}, {category:"",expense_date:"",vendor:" ",description:"",amount:"",renewal_date:"",notes:null}])("normalizes empty fields to null without invented values",input=>expect(expenseFields(input)).toEqual({category:null,expense_date:null,vendor:null,description:null,amount:null,renewal_date:null,notes:""}));
  it("distinguishes absent amount from zero",()=>{expect(money(null)).toBe("À compléter");expect(money(0)).not.toBe("À compléter");expect(expenseFields({amount:0}).amount).toBe(0);});
  it.each(["2027-02-29","2027-13-01",true])("rejects invalid renewal %s",renewal_date=>expect(()=>expenseFields({renewal_date})).toThrow());
  const rows=[{id:"a",...expenseFields({amount:10}),is_paid:false,created_at:"2026-10-05"},{id:"b",...expenseFields({category:"marketing",expense_date:"2026-10-05",amount:20}),is_paid:true,created_at:"2026-10-05"},{id:"c",...expenseFields({}),is_paid:false,created_at:"2026-10-05"}] as Expense[];
  const all={category:"all",period:"all",year:"2026",search:""} as const;
  it("includes undated unclassified entries in all periods",()=>expect(filterExpenses(rows,all)).toHaveLength(3));
  it("does not invent dates to fit a month",()=>expect(filterExpenses(rows,{...all,period:"month"},"2026-10-05")).toHaveLength(1));
  it("combines paid, category and period filters",()=>expect(filterExpenses(rows,{...all,payment:"paid",category:"marketing",period:"month"},"2026-10-05").map(r=>r.id)).toEqual(["b"]));
  it("unpaid filter preserves incomplete entries",()=>expect(filterExpenses(rows,{...all,payment:"unpaid"})).toHaveLength(2));
  it("total includes unclassified known amounts and excludes null amounts",()=>expect(expenseTotals(rows)).toEqual({total:30,marketing:20,operation:0}));
});
