import type { OaciqOcrDocument } from "./oaciq-ocr";
type Options = { signal: AbortSignal; onProgress: (message: string) => void };
/** Browser rendering only; classification, dates and persistence stay server-side. */
export async function prepareOaciqOcr(files: File[], options: Options): Promise<OaciqOcrDocument[]> {
  const moduleUrl = new URL("/oaciq-reader/ocr.js", window.location.origin).href;
  const module = await import(/* @vite-ignore */ moduleUrl) as { prepareOcrDocuments: (files: File[], options: Options) => Promise<OaciqOcrDocument[]> };
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(options.signal.reason);
    options.signal.addEventListener("abort", abort, { once: true });
    module.prepareOcrDocuments(files, options).then(resolve, reject)
      .finally(() => options.signal.removeEventListener("abort", abort));
  });
}
