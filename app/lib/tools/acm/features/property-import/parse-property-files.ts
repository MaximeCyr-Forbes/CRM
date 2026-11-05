import type { ParsePropertiesResponse, ParsedProperty } from "../../types";
import { validatePdfMetadata } from "../property-parser/validation";

export interface PropertyFileParseResult {
  properties: ParsedProperty[];
  errors: string[];
}

export async function parsePropertyFiles(files: File[]): Promise<PropertyFileParseResult> {
  const properties: ParsedProperty[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const validation = validatePdfMetadata(file);
    if (!validation.valid) {
      errors.push(`${file.name}: ${validation.message}`);
      continue;
    }
    const formData = new FormData();
    formData.append("file", file, file.name);
    try {
      const response = await fetch("/api/tools/acm/parse-properties", { method: "POST", body: formData, cache: "no-store" });
      const payload = await response.json() as ParsePropertiesResponse;
      if (!response.ok || payload.results.length === 0) {
        errors.push(`${file.name}: ${payload.errors[0]?.message ?? "La fiche n’a pas pu être analysée."}`);
      } else {
        properties.push(...payload.results);
      }
    } catch {
      errors.push(`${file.name}: Le service d’analyse est momentanément indisponible.`);
    }
  }
  return { properties, errors };
}
