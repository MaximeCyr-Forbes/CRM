export type ImportFileStatus = "selected" | "analyzing" | "ready" | "error";

export interface ImportedPropertyFile {
  id: string;
  file: File;
  status: ImportFileStatus;
  error?: string;
}
