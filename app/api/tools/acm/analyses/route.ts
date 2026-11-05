import { z } from "zod";
import { withCRMIdentity } from "@/app/lib/auth/route";
import { crmMemberContext } from "@/app/lib/auth/context";
import { requireApiAccess } from "@/app/lib/crm-access";
import { isSameOriginRequest } from "@/app/lib/google-calendar/config";
import { getSupabaseAdmin } from "@/app/lib/supabase/server";
import { SupabaseAnalysisRepository } from "@/app/lib/tools/acm/features/analyses/supabase-repository";
import { deserializeAnalysisSnapshot } from "@/app/lib/tools/acm/features/analyses/serialization";
const status = z.enum(["draft", "completed", "archived"]);
const schema = z.discriminatedUnion("action", [
 z.object({action: z.literal("list")}),
 z.object({action: z.enum(["get", "duplicate", "delete"]), id: z.uuid()}),
 z.object({action: z.literal("status"), id: z.uuid(), status}),
 z.object({action: z.literal("save"), input: z.object({id: z.uuid().optional(), title: z.string().max(500), status, snapshot: z.object({schemaVersion: z.literal(1), properties: z.array(z.record(z.string(),z.unknown())).max(50), workspaceState: z.object({selection: z.object({subjectId: z.string(), comparableIds: z.array(z.string()), excludedIds: z.array(z.string())}), emailDraft: z.object({firstName: z.string(), lastName: z.string()}).passthrough(), opinion: z.record(z.string(), z.unknown())}).passthrough()})})}),
]);
const json = (data: unknown, status = 200) => Response.json(data, {status, headers: {"Cache-Control": "private, no-store"}});
export const POST = withCRMIdentity(async (request: Request) => {
 const access = await requireApiAccess(); if (access.response) return access.response;
 if (!isSameOriginRequest(request)) return json({error: "Origine refusée."}, 403);
 const actor = crmMemberContext.getStore(); if (!actor) return json({error: "Connexion Google requise."}, 401);
 if (Number(request.headers.get("content-length")) > 8_000_000) return json({error: "Analyse trop volumineuse."}, 413);
 const raw = await request.text(); if (raw.length > 8_000_000) return json({error: "Analyse trop volumineuse."}, 413);
 let input;
 try {input = schema.parse(JSON.parse(raw));} catch {return json({error: "Analyse invalide."}, 400);}
 const repo = new SupabaseAnalysisRepository(getSupabaseAdmin(), actor.authUserId);
 try {
  switch (input.action) {
   case "list": return json({data: await repo.list()});
   case "get": return json({data: await repo.get(input.id)});
   case "save": return json({data: await repo.save({...input.input, snapshot: deserializeAnalysisSnapshot(input.input.snapshot)})});
   case "duplicate": return json({data: await repo.duplicate(input.id)});
   case "status": return json({data: await repo.setStatus(input.id, input.status)});
   case "delete": await repo.delete(input.id); return json({data: null});
  }
 } catch { return json({error: "L’analyse n’a pas pu être sauvegardée ou chargée. Vos modifications restent présentes."}, 503); }
});
