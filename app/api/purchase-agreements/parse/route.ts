import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import {
  extractPositionedTextFromPDF,
  PositionedPDFError,
} from "../../../lib/pdf/extract-positioned-text";
import { parsePurchaseAgreement } from "../../../lib/purchase-agreement/parse";
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
    const file = formData.get("file");
    if (!(file instanceof File) || files.length !== 1) {
      return noStoreJSON({ error: "Un seul fichier PDF est requis dans le champ file." }, 400);
    }

    size = file.size;
    const validation = validatePurchaseAgreementPDFUpload(file);
    if (!validation.valid) {
      return noStoreJSON({ error: validation.error, code: "invalid_pdf" }, validation.status);
    }

    stage = "extraction";
    const extracted = await extractPositionedTextFromPDF(new Uint8Array(await file.arrayBuffer()));
    pageCount = extracted.pageCount;
    stage = "parsing";
    return noStoreJSON({ data: parsePurchaseAgreement(extracted) });
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
