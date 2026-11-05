import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

const TEAM_PRESENTATION_PATH = path.join(process.cwd(), "app", "lib", "tools", "acm", "features", "reports", "assets", "equipe-forbes-presentation.pdf");

export async function readTeamPresentationPdf(): Promise<Uint8Array> {
  return readFile(TEAM_PRESENTATION_PATH);
}
