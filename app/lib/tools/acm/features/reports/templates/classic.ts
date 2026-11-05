import { PDFDocument, PDFFont, PDFPage, StandardFonts } from "pdf-lib";
import { ADJUSTMENT_CATEGORY_LABELS } from "../../comparables";
import { formatCmaCurrency, formatSignedCurrency, REFERENCE_PRICE_SOURCE_LABELS } from "../../analysis/value-presentation";
import type { ReportComparableSection, ReportDocumentData, ReportField, ReportPdfOptions } from "../types";
import {
  createGoogleStaticMapRequest,
  createReportMapEntries,
  fetchGoogleStaticMapImage,
} from "../maps/static-map";
import {
  A4_HEIGHT,
  A4_WIDTH,
  REPORT_COLORS,
  drawFooter,
  drawImageCover,
  drawLabel,
  drawWrappedText,
  embedDataImage,
  safePdfText,
} from "../pdf/pdf-utils";

interface ReportFonts {
  sans: PDFFont;
  sansBold: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
}

const MARGIN = 48;

function drawPageHeading(page: PDFPage, eyebrow: string, title: string, fonts: ReportFonts, width = A4_WIDTH) {
  drawLabel(page, eyebrow, MARGIN, page.getHeight() - 58, fonts.sansBold);
  page.drawText(safePdfText(title), { x: MARGIN, y: page.getHeight() - 98, size: 27, font: fonts.serif, color: REPORT_COLORS.ink });
  page.drawLine({ start: { x: MARGIN, y: page.getHeight() - 116 }, end: { x: width - MARGIN, y: page.getHeight() - 116 }, thickness: 0.8, color: REPORT_COLORS.line });
}

function drawFieldGrid(page: PDFPage, fields: ReportField[], fonts: ReportFonts, startY: number, columns = 2): number {
  if (fields.length === 0) return startY;
  const gap = 10;
  const width = (A4_WIDTH - MARGIN * 2 - gap * (columns - 1)) / columns;
  const cellHeight = 63;
  fields.forEach((field, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = MARGIN + column * (width + gap);
    const y = startY - row * (cellHeight + gap) - cellHeight;
    page.drawRectangle({ x, y, width, height: cellHeight, color: REPORT_COLORS.surface, borderColor: REPORT_COLORS.line, borderWidth: 0.5 });
    drawLabel(page, field.label, x + 13, y + 41, fonts.sansBold, REPORT_COLORS.muted);
    drawWrappedText(page, field.value, { x: x + 13, y: y + 19, width: width - 26, font: fonts.sansBold, size: 10, lineHeight: 12, maxLines: 2 });
  });
  return startY - Math.ceil(fields.length / columns) * (cellHeight + gap);
}

async function drawCover(document: PDFDocument, data: ReportDocumentData, fonts: ReportFonts) {
  const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawRectangle({ x: A4_WIDTH - 22, y: 0, width: 22, height: A4_HEIGHT, color: REPORT_COLORS.ink });
  page.drawRectangle({ x: MARGIN, y: A4_HEIGHT - 78, width: 38, height: 38, color: REPORT_COLORS.ink });
  page.drawText("AF", { x: MARGIN + 9, y: A4_HEIGHT - 65, size: 10, font: fonts.serifBold, color: REPORT_COLORS.white });
  drawLabel(page, "Équipe Forbes Team · RE/MAX Crystal", MARGIN + 51, A4_HEIGHT - 63, fonts.sansBold, REPORT_COLORS.muted);

  drawLabel(page, "Rapport immobilier", MARGIN, A4_HEIGHT - 150, fonts.sansBold);
  page.drawText("ANALYSE", { x: MARGIN, y: A4_HEIGHT - 205, size: 42, font: fonts.serif, color: REPORT_COLORS.ink });
  page.drawText("COMPARATIVE", { x: MARGIN, y: A4_HEIGHT - 250, size: 42, font: fonts.serif, color: REPORT_COLORS.ink });
  page.drawText("DE MARCHÉ", { x: MARGIN, y: A4_HEIGHT - 295, size: 42, font: fonts.serif, color: REPORT_COLORS.ink });

  const image = await embedDataImage(document, data.subject.primaryPhoto);
  if (image) {
    drawImageCover(page, image, MARGIN, 226, A4_WIDTH - MARGIN * 2 - 22, 220);
  } else {
    page.drawLine({ start: { x: MARGIN, y: 438 }, end: { x: A4_WIDTH - MARGIN - 22, y: 438 }, thickness: 2, color: REPORT_COLORS.accent });
  }

  drawLabel(page, "Propriété sujet", MARGIN, 191, fonts.sansBold);
  drawWrappedText(page, data.subject.title, { x: MARGIN, y: 161, width: 355, font: fonts.serif, size: 23, lineHeight: 27, maxLines: 2 });
  if (data.subject.property.data.city) page.drawText(safePdfText(data.subject.property.data.city), { x: MARGIN, y: 105, size: 11, font: fonts.sans, color: REPORT_COLORS.muted });
  page.drawText(safePdfText(`Préparée le ${data.preparedDate}`), { x: MARGIN, y: 77, size: 8, font: fonts.sans, color: REPORT_COLORS.lightMuted });

  drawLabel(page, "Préparée par", 380, 191, fonts.sansBold);
  page.drawText(safePdfText(data.preparer.displayName), { x: 380, y: 163, size: 16, font: fonts.serifBold, color: REPORT_COLORS.ink });
  data.preparer.reportCredentialLines.forEach((line, index) => {
    page.drawText(safePdfText(line), { x: 380, y: 143 - index * 12, size: 7.5, font: fonts.sans, color: REPORT_COLORS.muted });
  });
  page.drawText("Équipe Forbes Team", { x: 380, y: 104, size: 8, font: fonts.sansBold, color: REPORT_COLORS.ink });
  page.drawText("RE/MAX Crystal", { x: 380, y: 91, size: 8, font: fonts.sans, color: REPORT_COLORS.muted });
}

async function drawSubject(document: PDFDocument, data: ReportDocumentData, fonts: ReportFonts) {
  const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
  drawPageHeading(page, "Propriété sujet", "Propriété à évaluer", fonts);
  page.drawText(safePdfText(data.subject.title), { x: MARGIN, y: 687, size: 21, font: fonts.serifBold, color: REPORT_COLORS.ink });
  if (data.subject.subtitle) page.drawText(safePdfText(data.subject.subtitle), { x: MARGIN, y: 666, size: 9, font: fonts.sans, color: REPORT_COLORS.muted });

  const image = await embedDataImage(document, data.subject.primaryPhoto);
  let fieldsY = 620;
  if (image) {
    drawImageCover(page, image, MARGIN, 440, A4_WIDTH - MARGIN * 2, 180);
    fieldsY = 418;
  }
  const endY = drawFieldGrid(page, data.subject.fields, fonts, fieldsY, 2);
  if (data.subject.highlights.length > 0 && endY > 100) {
    drawLabel(page, "Caractéristiques importantes", MARGIN, endY - 3, fonts.sansBold);
    drawWrappedText(page, data.subject.highlights.join(" · "), { x: MARGIN, y: endY - 25, width: A4_WIDTH - MARGIN * 2, font: fonts.sans, size: 9, lineHeight: 14, maxLines: 4, color: REPORT_COLORS.muted });
  }
}

function drawMethodology(document: PDFDocument, fonts: ReportFonts) {
  const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
  drawPageHeading(page, "Approche", "Méthodologie de l'analyse", fonts);
  drawWrappedText(page, "L'analyse comparative de marché s'appuie sur des propriétés comparables choisies et interprétées par le courtier en fonction des informations disponibles.", {
    x: MARGIN, y: 680, width: 470, font: fonts.serif, size: 15, lineHeight: 22, maxLines: 5,
  });
  const criteria = ["Localisation", "Type de propriété", "Caractéristiques et superficie", "Terrain et état général", "Données transactionnelles disponibles", "Particularités pertinentes"];
  criteria.forEach((criterion, index) => {
    const y = 550 - index * 58;
    page.drawRectangle({ x: MARGIN, y: y - 9, width: 23, height: 23, color: REPORT_COLORS.accentSoft });
    page.drawText(String(index + 1).padStart(2, "0"), { x: MARGIN + 6, y: y - 2, size: 7, font: fonts.sansBold, color: REPORT_COLORS.accent });
    page.drawText(safePdfText(criterion), { x: MARGIN + 38, y, size: 11, font: fonts.sansBold, color: REPORT_COLORS.ink });
  });
  page.drawRectangle({ x: MARGIN, y: 90, width: A4_WIDTH - MARGIN * 2, height: 91, color: REPORT_COLORS.surface, borderColor: REPORT_COLORS.line, borderWidth: 0.6 });
  drawLabel(page, "Mention importante", MARGIN + 18, 156, fonts.sansBold);
  drawWrappedText(page, "Cette analyse comparative de marché constitue une opinion de valeur fondée sur les informations disponibles et les propriétés comparables sélectionnées. Elle ne constitue pas une évaluation professionnelle réalisée par un évaluateur agréé.", {
    x: MARGIN + 18, y: 135, width: A4_WIDTH - MARGIN * 2 - 36, font: fonts.sans, size: 8.5, lineHeight: 13, maxLines: 4, color: REPORT_COLORS.muted,
  });
}

function drawAdjustmentRows(page: PDFPage, comparable: ReportComparableSection, adjustments: ReportComparableSection["analysis"]["adjustments"], fonts: ReportFonts, startY: number) {
  drawLabel(page, "Ajustements", MARGIN, startY, fonts.sansBold);
  let y = startY - 28;
  if (adjustments.length === 0) {
    page.drawText("Aucun ajustement saisi", { x: MARGIN, y, size: 9, font: fonts.sans, color: REPORT_COLORS.lightMuted });
    y -= 26;
  } else {
    adjustments.forEach((adjustment) => {
      page.drawText(safePdfText(ADJUSTMENT_CATEGORY_LABELS[adjustment.category]), { x: MARGIN, y, size: 9, font: fonts.sansBold, color: REPORT_COLORS.ink });
      if (adjustment.description) page.drawText(safePdfText(adjustment.description).slice(0, 48), { x: 155, y, size: 7.5, font: fonts.sans, color: REPORT_COLORS.muted });
      const amount = adjustment.amount === null ? "-" : formatSignedCurrency(adjustment.amount);
      const amountWidth = fonts.sansBold.widthOfTextAtSize(safePdfText(amount), 9);
      page.drawText(safePdfText(amount), { x: A4_WIDTH - MARGIN - amountWidth, y, size: 9, font: fonts.sansBold, color: adjustment.amount !== null && adjustment.amount < 0 ? REPORT_COLORS.muted : REPORT_COLORS.accent });
      page.drawLine({ start: { x: MARGIN, y: y - 9 }, end: { x: A4_WIDTH - MARGIN, y: y - 9 }, thickness: 0.4, color: REPORT_COLORS.line });
      y -= 27;
    });
  }
  return y;
}

function drawComparableTotals(page: PDFPage, comparable: ReportComparableSection, fonts: ReportFonts, startY: number) {
  page.drawRectangle({ x: MARGIN, y: startY - 78, width: 220, height: 67, color: REPORT_COLORS.surface });
  drawLabel(page, "Total des ajustements", MARGIN + 14, startY - 31, fonts.sansBold, REPORT_COLORS.muted);
  page.drawText(safePdfText(formatSignedCurrency(comparable.analysis.totalAdjustments)), { x: MARGIN + 14, y: startY - 59, size: 17, font: fonts.serifBold, color: REPORT_COLORS.ink });
  page.drawRectangle({ x: 282, y: startY - 78, width: A4_WIDTH - MARGIN - 282, height: 67, color: REPORT_COLORS.ink });
  drawLabel(page, "Prix ajusté", 297, startY - 31, fonts.sansBold, REPORT_COLORS.lightMuted);
  page.drawText(safePdfText(formatCmaCurrency(comparable.analysis.adjustedPrice)), { x: 297, y: startY - 61, size: 24, font: fonts.serifBold, color: REPORT_COLORS.white });
}

async function drawComparable(document: PDFDocument, comparable: ReportComparableSection, index: number, fonts: ReportFonts) {
  const chunks = comparable.analysis.adjustments.length > 0
    ? [comparable.analysis.adjustments.slice(0, 4), ...Array.from({ length: Math.ceil(Math.max(0, comparable.analysis.adjustments.length - 4) / 13) }, (_, chunkIndex) => comparable.analysis.adjustments.slice(4 + chunkIndex * 13, 4 + (chunkIndex + 1) * 13))]
    : [[]];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    drawPageHeading(page, `Comparable ${index + 1}`, chunkIndex === 0 ? comparable.title : `${comparable.title} - ajustements (suite)`, fonts);
    if (chunkIndex === 0) {
      if (comparable.subtitle) page.drawText(safePdfText(comparable.subtitle), { x: MARGIN, y: 690, size: 8.5, font: fonts.sans, color: REPORT_COLORS.muted });
      const image = await embedDataImage(document, comparable.primaryPhoto);
      if (image) drawImageCover(page, image, 340, 535, 207, 157);

      const referenceLabel = comparable.analysis.referencePriceSource ? REFERENCE_PRICE_SOURCE_LABELS[comparable.analysis.referencePriceSource] : "Prix de référence indisponible";
      drawLabel(page, referenceLabel, MARGIN, 625, fonts.sansBold);
      page.drawText(safePdfText(formatCmaCurrency(comparable.analysis.referencePrice)), { x: MARGIN, y: 586, size: 27, font: fonts.serifBold, color: REPORT_COLORS.ink });
      if (comparable.property.data.askingPrice) page.drawText(safePdfText(`Prix demandé ${formatCmaCurrency(comparable.property.data.askingPrice)}`), { x: MARGIN, y: 559, size: 8, font: fonts.sans, color: REPORT_COLORS.muted });
      if (comparable.property.data.soldPrice) page.drawText(safePdfText(`Prix vendu ${formatCmaCurrency(comparable.property.data.soldPrice)}`), { x: MARGIN, y: 544, size: 8, font: fonts.sans, color: REPORT_COLORS.muted });
      const fieldsEnd = drawFieldGrid(page, comparable.fields.slice(0, 6), fonts, 505, 2);
      const adjustmentsEnd = drawAdjustmentRows(page, comparable, chunks[chunkIndex], fonts, Math.min(fieldsEnd - 2, 205));
      drawComparableTotals(page, comparable, fonts, Math.max(91, adjustmentsEnd));
    } else {
      const adjustmentsEnd = drawAdjustmentRows(page, comparable, chunks[chunkIndex], fonts, 675);
      if (chunkIndex === chunks.length - 1) drawComparableTotals(page, comparable, fonts, Math.max(91, adjustmentsEnd));
    }
  }
}

function drawComparisonPages(document: PDFDocument, data: ReportDocumentData, fonts: ReportFonts) {
  const comparableChunks = data.comparables.length === 0 ? [[]] : Array.from({ length: Math.ceil(data.comparables.length / 3) }, (_, index) => data.comparables.slice(index * 3, index * 3 + 3));
  comparableChunks.forEach((chunk, chunkIndex) => {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    drawPageHeading(page, "Vue synthèse", chunkIndex === 0 ? "Comparaison des propriétés" : "Comparaison des propriétés (suite)", fonts);
    const columns = [data.subject, ...chunk];
    const labels = ["Sujet", ...chunk.map((_, index) => `Comparable ${chunkIndex * 3 + index + 1}`)];
    const tableX = MARGIN;
    const tableTop = 636;
    const tableWidth = A4_WIDTH - MARGIN * 2;
    const criteriaWidth = 112;
    const dataWidth = (tableWidth - criteriaWidth) / columns.length;
    const headerHeight = 64;
    const rowHeight = 36;
    page.drawRectangle({ x: tableX, y: tableTop, width: criteriaWidth, height: headerHeight, color: REPORT_COLORS.ink });
    page.drawText("CRITÈRES", { x: tableX + 10, y: tableTop + 27, size: 7.5, font: fonts.sansBold, color: REPORT_COLORS.white });
    columns.forEach((column, index) => {
      const x = tableX + criteriaWidth + index * dataWidth;
      page.drawRectangle({ x, y: tableTop, width: dataWidth, height: headerHeight, color: index === 0 ? REPORT_COLORS.accentSoft : REPORT_COLORS.surface, borderColor: REPORT_COLORS.line, borderWidth: 0.5 });
      drawLabel(page, labels[index], x + 7, tableTop + 43, fonts.sansBold, index === 0 ? REPORT_COLORS.accent : REPORT_COLORS.muted);
      drawWrappedText(page, column.title, { x: x + 7, y: tableTop + 23, width: dataWidth - 14, font: fonts.serifBold, size: 8, lineHeight: 9.5, maxLines: 2 });
    });
    data.comparisonRows.forEach((row, rowIndex) => {
      const y = tableTop - (rowIndex + 1) * rowHeight;
      page.drawRectangle({ x: tableX, y, width: criteriaWidth, height: rowHeight, color: REPORT_COLORS.surface, borderColor: REPORT_COLORS.line, borderWidth: 0.4 });
      drawWrappedText(page, row.label, { x: tableX + 8, y: y + 21, width: criteriaWidth - 16, font: fonts.sansBold, size: 7.2, lineHeight: 8.5, maxLines: 2 });
      const sourceIndexes = [0, ...chunk.map((comparable) => data.comparables.findIndex((item) => item.property.id === comparable.property.id) + 1)];
      sourceIndexes.forEach((sourceIndex, index) => {
        const x = tableX + criteriaWidth + index * dataWidth;
        page.drawRectangle({ x, y, width: dataWidth, height: rowHeight, color: index === 0 ? REPORT_COLORS.accentSoft : REPORT_COLORS.white, borderColor: REPORT_COLORS.line, borderWidth: 0.4 });
        drawWrappedText(page, row.values[sourceIndex] ?? "-", { x: x + 7, y: y + 21, width: dataWidth - 14, font: fonts.sans, size: 7.2, lineHeight: 8.5, maxLines: 2 });
      });
    });
  });
}

function drawSummary(document: PDFDocument, data: ReportDocumentData, fonts: ReportFonts) {
  const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
  drawPageHeading(page, "Conclusion", "Synthèse de l'analyse", fonts);
  const stats = [
    ["Prix ajusté le plus bas", data.statistics.minimum],
    ["Prix ajusté le plus élevé", data.statistics.maximum],
    ["Moyenne", data.statistics.average],
    ["Médiane", data.statistics.median],
  ] as const;
  stats.forEach(([label, value], index) => {
    const width = (A4_WIDTH - MARGIN * 2 - 24) / 4;
    const x = MARGIN + index * (width + 8);
    page.drawRectangle({ x, y: 620, width, height: 88, color: REPORT_COLORS.surface, borderColor: REPORT_COLORS.line, borderWidth: 0.5 });
    drawWrappedText(page, label, { x: x + 11, y: 681, width: width - 22, font: fonts.sansBold, size: 6.5, lineHeight: 8, maxLines: 2, color: REPORT_COLORS.muted });
    page.drawText(safePdfText(formatCmaCurrency(value)), { x: x + 11, y: 643, size: 13, font: fonts.serifBold, color: REPORT_COLORS.ink });
  });

  page.drawRectangle({ x: MARGIN, y: 395, width: A4_WIDTH - MARGIN * 2, height: 185, color: REPORT_COLORS.ink });
  drawLabel(page, "Opinion de valeur", MARGIN + 22, 548, fonts.sansBold, REPORT_COLORS.accentSoft);
  const values = [
    ["Valeur minimale", data.opinion.minimumValue],
    ["Valeur maximale", data.opinion.maximumValue],
    ["Valeur recommandée", data.opinion.recommendedValue],
  ] as const;
  values.forEach(([label, value], index) => {
    const x = MARGIN + 22 + index * 158;
    drawLabel(page, label, x, 508, fonts.sansBold, REPORT_COLORS.lightMuted);
    page.drawText(safePdfText(formatCmaCurrency(value)), { x, y: 468, size: index === 2 ? 22 : 17, font: fonts.serifBold, color: index === 2 ? REPORT_COLORS.accentSoft : REPORT_COLORS.white });
  });
  page.drawText("Opinion formulée manuellement par le courtier", { x: MARGIN + 22, y: 421, size: 7, font: fonts.sans, color: REPORT_COLORS.lightMuted });

  const minimum = data.opinion.minimumValue;
  const maximum = data.opinion.maximumValue;
  const recommended = data.opinion.recommendedValue;
  drawLabel(page, "Fourchette de valeur", MARGIN, 354, fonts.sansBold);
  if (minimum !== undefined && maximum !== undefined && recommended !== undefined && maximum >= minimum) {
    const lineX = MARGIN + 34;
    const lineWidth = A4_WIDTH - MARGIN * 2 - 68;
    const ratio = maximum === minimum ? 0.5 : Math.max(0, Math.min(1, (recommended - minimum) / (maximum - minimum)));
    page.drawLine({ start: { x: lineX, y: 316 }, end: { x: lineX + lineWidth, y: 316 }, thickness: 2, color: REPORT_COLORS.line });
    [0, ratio, 1].forEach((position, index) => page.drawCircle({ x: lineX + lineWidth * position, y: 316, size: index === 1 ? 7 : 4, color: index === 1 ? REPORT_COLORS.accent : REPORT_COLORS.ink }));
    page.drawText(safePdfText(formatCmaCurrency(minimum)), { x: lineX - 12, y: 288, size: 8, font: fonts.sansBold, color: REPORT_COLORS.ink });
    const recommendedText = safePdfText(formatCmaCurrency(recommended));
    page.drawText(recommendedText, { x: lineX + lineWidth * ratio - fonts.sansBold.widthOfTextAtSize(recommendedText, 9) / 2, y: 337, size: 9, font: fonts.sansBold, color: REPORT_COLORS.accent });
    const maximumText = safePdfText(formatCmaCurrency(maximum));
    page.drawText(maximumText, { x: lineX + lineWidth - fonts.sansBold.widthOfTextAtSize(maximumText, 8) + 12, y: 288, size: 8, font: fonts.sansBold, color: REPORT_COLORS.ink });
  } else {
    page.drawText("Fourchette non complétée", { x: MARGIN, y: 316, size: 9, font: fonts.sans, color: REPORT_COLORS.lightMuted });
  }

  drawLabel(page, "Commentaire du courtier", MARGIN, 242, fonts.sansBold);
  if (data.opinion.brokerComment.trim()) {
    drawWrappedText(page, data.opinion.brokerComment, { x: MARGIN, y: 218, width: A4_WIDTH - MARGIN * 2, font: fonts.sans, size: 9, lineHeight: 14, maxLines: 8, color: REPORT_COLORS.muted });
  } else {
    page.drawText("Aucun commentaire ajouté.", { x: MARGIN, y: 218, size: 9, font: fonts.sans, color: REPORT_COLORS.lightMuted });
  }
  drawWrappedText(page, "Cette analyse comparative de marché constitue une opinion de valeur et non une évaluation réalisée par un évaluateur agréé.", { x: MARGIN, y: 82, width: A4_WIDTH - MARGIN * 2, font: fonts.sans, size: 7, lineHeight: 10, maxLines: 2, color: REPORT_COLORS.lightMuted });
}

function drawMapBackground(page: PDFPage, x: number, y: number, width: number, height: number) {
  page.drawRectangle({ x, y, width, height, color: REPORT_COLORS.surface });
  for (let index = 1; index < 8; index += 1) {
    const lineX = x + width * index / 8;
    page.drawLine({ start: { x: lineX, y }, end: { x: lineX, y: y + height }, thickness: 0.4, color: REPORT_COLORS.line });
  }
  for (let index = 1; index < 5; index += 1) {
    const lineY = y + height * index / 5;
    page.drawLine({ start: { x, y: lineY }, end: { x: x + width, y: lineY }, thickness: 0.4, color: REPORT_COLORS.line });
  }
}

function drawMapMarker(page: PDFPage, label: string, x: number, y: number, fonts: ReportFonts, isSubject: boolean) {
  const fill = isSubject ? REPORT_COLORS.ink : REPORT_COLORS.white;
  const textColor = isSubject ? REPORT_COLORS.white : REPORT_COLORS.ink;
  page.drawLine({ start: { x, y: y - 9 }, end: { x, y: y - 18 }, thickness: 4, color: REPORT_COLORS.ink });
  page.drawCircle({ x, y, size: 12, color: fill, borderColor: REPORT_COLORS.ink, borderWidth: 1.5 });
  const size = label.length > 1 ? 7 : 8;
  const width = fonts.sansBold.widthOfTextAtSize(label, size);
  page.drawText(label, { x: x - width / 2, y: y - size / 2 + 1.5, size, font: fonts.sansBold, color: textColor });
}

async function drawComparableMapPage(
  document: PDFDocument,
  data: ReportDocumentData,
  fonts: ReportFonts,
  options?: ReportPdfOptions,
) {
  const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
  drawPageHeading(page, "Localisation", "Carte des comparables", fonts);
  drawWrappedText(page, "Localisation de la propriété sujet et des propriétés comparables utilisées dans l'analyse.", {
    x: MARGIN,
    y: 697,
    width: A4_WIDTH - MARGIN * 2,
    font: fonts.sans,
    size: 9,
    lineHeight: 13,
    maxLines: 2,
    color: REPORT_COLORS.muted,
  });

  const mapX = MARGIN;
  const mapY = 324;
  const mapWidth = A4_WIDTH - MARGIN * 2;
  const mapHeight = 345;
  const entries = createReportMapEntries(data);
  const hasCoordinates = entries.some((entry) => entry.coordinates !== null);
  const request = createGoogleStaticMapRequest(entries, { apiKey: options?.mapApiKey });
  drawMapBackground(page, mapX, mapY, mapWidth, mapHeight);
  let mapLoaded = false;

  if (request) {
    try {
      const imageLoader = options?.mapImageLoader ?? fetchGoogleStaticMapImage;
      const image = await document.embedPng(await imageLoader(request));
      page.drawImage(image, { x: mapX, y: mapY, width: mapWidth, height: mapHeight });
      mapLoaded = true;
    } catch (error) {
      console.warn(`[report-map] Google Static Map unavailable (${error instanceof Error ? error.name : "unknown"}).`);
    }
  }

  page.drawRectangle({ x: mapX, y: mapY, width: mapWidth, height: mapHeight, borderColor: REPORT_COLORS.line, borderWidth: 0.8 });
  if (!hasCoordinates) {
    const message = "Localisation non disponible";
    page.drawText(message, {
      x: mapX + (mapWidth - fonts.serif.widthOfTextAtSize(message, 15)) / 2,
      y: mapY + mapHeight / 2,
      size: 15,
      font: fonts.serif,
      color: REPORT_COLORS.muted,
    });
  } else if (!mapLoaded) {
    page.drawRectangle({ x: mapX + 11, y: mapY + 10, width: 195, height: 19, color: REPORT_COLORS.white, opacity: 0.92 });
    page.drawText("Carte temporairement indisponible", { x: mapX + 17, y: mapY + 17, size: 6.5, font: fonts.sans, color: REPORT_COLORS.muted });
  }

  drawLabel(page, "Légende", MARGIN, 294, fonts.sansBold);
  const columns = entries.length <= 6 ? 2 : entries.length <= 12 ? 3 : 4;
  const rows = Math.ceil(entries.length / columns);
  const columnWidth = (A4_WIDTH - MARGIN * 2) / columns;
  const rowHeight = Math.min(47, 184 / Math.max(rows, 1));
  entries.forEach((entry, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x = MARGIN + column * columnWidth;
    const y = 266 - row * rowHeight;
    drawMapMarker(page, entry.markerLabel, x + 11, y - 5, fonts, entry.isSubject);
    drawLabel(page, entry.role, x + 31, y + 2, fonts.sansBold, entry.isSubject ? REPORT_COLORS.accent : REPORT_COLORS.muted);
    const address = [entry.property.data.address, entry.property.data.city].filter(Boolean).join(", ") || "Adresse non détectée";
    drawWrappedText(page, address, { x: x + 31, y: y - 13, width: columnWidth - 40, font: fonts.serifBold, size: 8.5, lineHeight: 10, maxLines: 2 });
    if (!entry.coordinates) page.drawText("Localisation non disponible", { x: x + 31, y: y - 35, size: 6.5, font: fonts.sans, color: REPORT_COLORS.lightMuted });
  });
}

export async function createClassicReportPdf(data: ReportDocumentData, options?: ReportPdfOptions): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Analyse comparative de marché - ${data.subject.title}`);
  document.setAuthor(`${data.preparer.displayName} - Équipe Forbes Team`);
  document.setSubject("Analyse comparative de marché");
  document.setCreator("ACM Forbes");
  document.setProducer("ACM Forbes");

  const fonts: ReportFonts = {
    sans: await document.embedFont(StandardFonts.Helvetica),
    sansBold: await document.embedFont(StandardFonts.HelveticaBold),
    serif: await document.embedFont(StandardFonts.TimesRoman),
    serifBold: await document.embedFont(StandardFonts.TimesRomanBold),
  };

  await drawCover(document, data, fonts);
  await drawSubject(document, data, fonts);
  drawMethodology(document, fonts);
  for (let index = 0; index < data.comparables.length; index += 1) {
    await drawComparable(document, data.comparables[index], index, fonts);
  }
  drawComparisonPages(document, data, fonts);
  drawSummary(document, data, fonts);
  await drawComparableMapPage(document, data, fonts, options);
  document.getPages().forEach((page, index) => drawFooter(page, index + 1, fonts.sans, page.getWidth()));
  return document.save({ useObjectStreams: true });
}
