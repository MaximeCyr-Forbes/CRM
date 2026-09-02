import { requireApiAccess } from "../../../lib/crm-access";
import { isSameOriginRequest } from "../../../lib/google-calendar/config";
import { analyzeOaciqTransaction } from "../../../lib/transactions/oaciq-analysis";
import { OACIQ_UPLOAD_LIMITS, validateOaciqFiles } from "../../../lib/transactions/oaciq-agenda";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const access = await requireApiAccess();
  if (access.response) return access.response;
  if (!isSameOriginRequest(request)) return json({ error: "Origine refusée." }, 403);
  if (Number(request.headers.get("content-length")) > OACIQ_UPLOAD_LIMITS.bytes + 100_000) return json({ error: "Le dossier dépasse 4 Mo au total." }, 413);
  try {
    const form = await request.formData();
    const files = form.getAll("files");
    if (!files.every((f): f is File => f instanceof File)) return json({ error: "Documents PDF invalides." }, 400);
    const error = validateOaciqFiles(files);
    if (error) return json({ error }, 400);
    const inputs = [];
    for (const file of files) inputs.push({ name: file.name.replace(/[\u0000-\u001f/\\]/g, "_").slice(0, 255), data: new Uint8Array(await file.arrayBuffer()) });
    // One consolidated dossier, no insert, no Google request, no PDF persisted.
    const data = await analyzeOaciqTransaction(inputs);
    return json({ data });
  } catch (error) {
    // Never log parser errors, filenames, text, parties, signatures or clauses.
    const scan = error instanceof Error && /OCR/.test(error.message);
    return json({ error: scan ? "Ce PDF est un scan sans texte exploitable. Utilisez une version PDF texte ou saisissez les échéances manuellement." : "Analyse OACIQ impossible. Vérifiez les PDF (lisibles, non protégés par mot de passe) puis réessayez, ou ajoutez les échéances manuellement." }, 422);
  }
}
