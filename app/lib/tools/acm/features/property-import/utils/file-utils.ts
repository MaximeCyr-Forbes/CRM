const PDF_MIME_TYPE = "application/pdf";

export function isPdfFile(file: File): boolean {
  return file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith(".pdf");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} Ko`;

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} Mo`;
}

export function createFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}
