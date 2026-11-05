import { POST as handle } from "@/app/lib/tools/acm/handlers/reports/generate/route";
import { withCRMIdentity } from "@/app/lib/auth/route";
import { requireApiAccess } from "@/app/lib/crm-access";
import { isSameOriginRequest } from "@/app/lib/google-calendar/config";
export const runtime = "nodejs";
export const POST = withCRMIdentity(async (request: Request) => {
 const access = await requireApiAccess();
 if (access.response) return access.response;
 if (!isSameOriginRequest(request)) return Response.json({error: "Origine refusée."}, {status: 403});
 return handle(request);
});
