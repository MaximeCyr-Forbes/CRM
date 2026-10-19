import {z} from 'zod';
import {actionKey,broker,MCPAccessError} from './access';
import type {ToolDefinition} from './read-tools';
const positiveMessage='INVENTORY_ADDITION_MUST_BE_POSITIVE';
export const inventoryStockSchema=z.strictObject({
 action_id:actionKey,
 inventory_type:z.enum(['sign','bac','addon']),
 quantity:z.number({error:positiveMessage}).int({error:positiveMessage}).min(1,{error:positiveMessage}).max(100000),
 broker:broker.nullable().optional(),
 addon_type:z.string().min(1).max(100).nullable().optional().describe('ID exact d’un ajout existant renvoyé par crm_get_sign_inventory, par exemple addon:sold. Aucun nouveau type.'),
}).superRefine((a,c)=>{
 if(a.inventory_type==='sign' && (!a.broker || a.addon_type)) c.addIssue({code:'custom',message:'Pancarte : courtier obligatoire, sans addon_type.'});
 if(a.inventory_type==='bac' && (a.broker || a.addon_type)) c.addIssue({code:'custom',message:'Les BAC sont globales : sans courtier ni addon_type.'});
 if(a.inventory_type==='addon' && (!a.addon_type || a.broker)) c.addIssue({code:'custom',message:'Ajout : addon_type existant obligatoire, sans courtier.'});
});
export const addInventoryStockTool:ToolDefinition={
 name:'crm_add_sign_inventory_stock',write:true,atomicWrite:true,schema:inventoryStockSchema,
 description:'Ajouter du NOUVEAU matériel au stock Pancartes / BAC : une quantité positive est ajoutée au total existant. Exemples : « Ajoute une pancarte à Maxime », « 4 nouvelles pancartes pour France », « 5 nouvelles boîtes à clés », « Ajoute 10 Vendu ». Lire crm_get_sign_inventory pour les types existants. Réservé à la gestion de stock autorisée. Aucune diminution, suppression, création de type ou valeur totale absolue. Pour poser du matériel existant sur une propriété, utiliser crm_assign_sign_material ; pour son retour, crm_return_sign_material. Réutiliser action_id et paramètres après un timeout.',
 async run(input,db,identity){
  // Independent of the MCP protocol schema; the RPC validates again in PostgreSQL.
  if(typeof input.quantity!=='number'||!Number.isInteger(input.quantity)||input.quantity<1) throw new MCPAccessError(positiveMessage,'La quantité à ajouter doit être un entier strictement positif.');
  const a=inventoryStockSchema.parse(input);
  if(identity.role!=='admin')throw new MCPAccessError('FORBIDDEN','La gestion du stock est réservée aux administrateurs.');
  const {data,error}=await db.rpc('crm_mcp_add_inventory_stock',{p_data:{...a,broker:a.broker??null,addon_type:a.addon_type??null}});
  if(error){
   if(error.message===positiveMessage)throw new MCPAccessError(positiveMessage,'La quantité à ajouter doit être un entier strictement positif.');
   if(error.code==='42501')throw new MCPAccessError('FORBIDDEN','Gestion du stock non autorisée.');
   if(error.code==='23505')throw new MCPAccessError('CONFLICT','Cette action_id est déjà utilisée avec d’autres paramètres.');
   if(error.code==='22023')throw new MCPAccessError('INVALID_INPUT','Matériel, courtier ou quantité invalide. Relisez l’inventaire existant.');
   throw error;
  }
  return data;
 }
};
