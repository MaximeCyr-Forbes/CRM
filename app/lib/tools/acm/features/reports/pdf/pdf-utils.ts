import { PDFDocument, PDFImage, PDFFont, PDFPage, rgb } from "pdf-lib";

export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;
export const REPORT_COLORS = {
  ink: rgb(0.075, 0.075, 0.07),
  muted: rgb(0.42, 0.41, 0.38),
  lightMuted: rgb(0.62, 0.6, 0.56),
  line: rgb(0.86, 0.85, 0.82),
  surface: rgb(0.97, 0.965, 0.95),
  accent: rgb(0.54, 0.45, 0.34),
  accentSoft: rgb(0.93, 0.9, 0.85),
  white: rgb(1, 1, 1),
};

export function safePdfText(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2212/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...");
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = safePdfText(text).split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function drawWrappedText(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; width: number; font: PDFFont; size: number; lineHeight?: number; color?: ReturnType<typeof rgb>; maxLines?: number },
): number {
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  const lines = wrapText(text, options.font, options.size, options.width).slice(0, options.maxLines);
  lines.forEach((line, index) => page.drawText(line, {
    x: options.x,
    y: options.y - index * lineHeight,
    size: options.size,
    font: options.font,
    color: options.color ?? REPORT_COLORS.ink,
  }));
  return options.y - lines.length * lineHeight;
}

export async function embedDataImage(document: PDFDocument, source?: string): Promise<PDFImage | null> {
  if (!source) return null;
  const match = source.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  if (!match) return null;
  try {
    const bytes = Buffer.from(match[2], "base64");
    return match[1].toLowerCase() === "png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
  } catch {
    return null;
  }
}

export function drawImageCover(page: PDFPage, image: PDFImage, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  page.drawRectangle({ x, y, width, height, color: REPORT_COLORS.surface });
  page.drawImage(image, {
    x: x + (width - drawWidth) / 2,
    y: y + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });
}

export function drawLabel(page: PDFPage, label: string, x: number, y: number, font: PDFFont, color = REPORT_COLORS.accent) {
  page.drawText(safePdfText(label.toUpperCase()), { x, y, size: 7, font, color });
}

export function drawFooter(page: PDFPage, pageNumber: number, font: PDFFont, width = A4_WIDTH) {
  page.drawLine({ start: { x: 48, y: 34 }, end: { x: width - 48, y: 34 }, thickness: 0.7, color: REPORT_COLORS.line });
  page.drawText("ACM FORBES", { x: 48, y: 19, size: 6.5, font, color: REPORT_COLORS.lightMuted });
  const pageLabel = String(pageNumber).padStart(2, "0");
  page.drawText(pageLabel, { x: width - 48 - font.widthOfTextAtSize(pageLabel, 7), y: 19, size: 7, font, color: REPORT_COLORS.lightMuted });
}
