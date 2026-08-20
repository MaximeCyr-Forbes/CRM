import { describe, expect, it } from "vitest";
import { extractTextFromPDF } from "./extract-text";

function blankPDF() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function textPDF() {
  const text = "No Centris 91000001 10 Rue Demo Ville-Test QC A1A 1A1 499 900 $ Genre de propriete Maison de plain-pied";
  const stream = `BT\n/F1 10 Tf\n40 740 Td\n(${text}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("extraction PDF Centris locale", () => {
  it("rejette un fichier dont la signature n’est pas PDF", async () => {
    await expect(extractTextFromPDF(new TextEncoder().encode("texte ordinaire"))).rejects.toMatchObject({
      category: "invalid_pdf",
    });
  });

  it("rejette clairement un PDF valide sans couche texte", async () => {
    await expect(extractTextFromPDF(blankPDF())).rejects.toMatchObject({
      category: "no_text",
      message: "Cette fiche PDF ne contient aucun texte lisible. Utilisez une fiche Centris exportée directement en PDF.",
    });
  });

  it("extrait la couche texte d’un PDF synthétique dans le runtime Node", async () => {
    const extracted = await extractTextFromPDF(textPDF());
    expect(extracted.pageCount).toBe(1);
    expect(extracted.pages[0]?.text).toContain("No Centris 91000001");
    expect(extracted.pages[0]?.text).toContain("499 900 $");
    expect(extracted.pages[0]?.text).toContain("Maison de plain-pied");
  });
});
