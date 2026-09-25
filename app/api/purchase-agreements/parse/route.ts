import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import {
  PositionedPDFError,
} from "../../../lib/pdf/extract-positioned-text";
import { analyzePurchaseAgreementBundle } from "../../../lib/purchase-agreement/bundle";
import { OACIQ_LIMITS } from "../../../lib/oaciq-reader/pdf";
import { validatePurchaseAgreementPDFUpload } from "../../../lib/purchase-agreement/validate-upload";

export const dynamic = "force-dynamic";

function noStoreJSON(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return noStoreJSON({ error: "Origine refusée." }, 403);

  let size = 0;
  let pageCount = 0;
  let stage = "multipart";

  try {
    const formData = await request.formData();
    const files = [...formData.values()].filter((value): value is File => value instanceof File);
    if (!files.length || files.length > OACIQ_LIMITS.files || files.reduce((n,f)=>n+f.size,0) > OACIQ_LIMITS.bytes) {
      return noStoreJSON({ error: "Nombre ou volume des documents PDF invalide." }, 400);
    }
    for (const file of files) {
      size += file.size;
      const validation = validatePurchaseAgreementPDFUpload(file);
      if (!validation.valid) return noStoreJSON({ error: validation.error, code: "invalid_pdf" }, validation.status);
    }
    stage = "extraction";
    const inputs = await Promise.all(files.map(async file => ({name:file.name,data:new Uint8Array(await file.arrayBuffer())})));
    return noStoreJSON({ data: await analyzePurchaseAgreementBundle(inputs) });
  } catch (error) {
    const failure = error instanceof PositionedPDFError ? error : null;
    console.error("Analyse de la promesse d’achat PDF impossible", {
      code: failure?.code ?? "parse_failed",
      size,
      pageCount: failure?.pageCount ?? pageCount,
      stage: failure?.stage ?? stage,
    });
    return noStoreJSON({
      error: failure?.message ?? "La promesse d’achat n’a pas pu être analysée.",
      code: failure?.code ?? "parse_failed",
    }, failure?.code === "invalid_pdf" || failure?.code === "no_text" ? 422 : 500);
  }
}
