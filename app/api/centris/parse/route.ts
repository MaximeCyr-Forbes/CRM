import { requireApiAccess } from "../../../lib/crm-access";
import { extractTextFromPDF } from "../../../lib/centris-pdf/extract-text";
import { parseCentrisText } from "../../../lib/centris-pdf/parse";
import { CentrisPDFError } from "../../../lib/centris-pdf/types";
import { validateCentrisPDFUpload } from "../../../lib/centris-pdf/validate-upload";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";

export const dynamic = "force-dynamic";

function sanitizedFileName(value: string) {
  return value.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 180) || "fiche-centris.pdf";
}

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

  let safeName = "fiche-centris.pdf";
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
    safeName = sanitizedFileName(file.name);
    size = file.size;
    const validation = validateCentrisPDFUpload(file);
    if (!validation.valid) return noStoreJSON({ error: validation.error, code: "invalid_pdf" }, validation.status);

    stage = "extraction";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractTextFromPDF(bytes);
    pageCount = extracted.pageCount;
    stage = "parsing";
    return noStoreJSON({ data: parseCentrisText(extracted, safeName) });
  } catch (error) {
    const failure = error instanceof CentrisPDFError ? error : null;
    console.error("Analyse PDF Centris impossible", {
      category: failure?.category ?? "parse_failed",
      fileName: safeName,
      size,
      pageCount: failure?.pageCount ?? pageCount,
      stage: failure?.stage ?? stage,
      runtimeErrorName: failure?.runtimeErrorName || undefined,
    });
    return noStoreJSON({
      error: failure?.message ?? "La fiche Centris n’a pas pu être analysée.",
      code: failure?.category ?? "parse_failed",
    }, failure?.category === "invalid_pdf" || failure?.category === "no_text" ? 422 : 500);
  }
}
