import { generateFinalReportWithWarnings, prepareReportDocumentData, readTeamPresentationPdf } from "@/app/lib/tools/acm/features/reports";
import { parseReportGenerationRequest } from "@/app/lib/tools/acm/features/reports/request-validation";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Le format de la demande est invalide." }, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "Les données de l’ACM sont trop volumineuses pour générer la brochure." }, { status: 413 });
  }

  try {
    const requestBytes = await request.arrayBuffer();
    if (requestBytes.byteLength > MAX_REQUEST_BYTES) {
      return Response.json({ error: "Les données de l’ACM sont trop volumineuses pour générer la brochure." }, { status: 413 });
    }
    const payload = parseReportGenerationRequest(JSON.parse(new TextDecoder().decode(requestBytes)) as unknown);
    if (!payload) return Response.json({ error: "Les données de l’ACM sont invalides ou incomplètes." }, { status: 400 });

    const prepared = prepareReportDocumentData(payload.report, new Date(), payload.template ?? "classic");
    const teamPresentation = await readTeamPresentationPdf();
    const result = await generateFinalReportWithWarnings(prepared, teamPresentation);
    const pdf = result.pdf;
    const disposition = new URL(request.url).searchParams.get("disposition") === "attachment" ? "attachment" : "inline";

    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${prepared.fileName}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "X-Report-Filename": prepared.fileName,
        "X-Report-Warnings": encodeURIComponent(JSON.stringify(result.warnings)),
      },
    });
  } catch {
    return Response.json({ error: "La brochure n’a pas pu être générée. Réessayez dans quelques instants." }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}
