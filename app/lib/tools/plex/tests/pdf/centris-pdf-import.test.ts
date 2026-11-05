import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractCentrisPdfBytes } from "@/app/lib/tools/plex/infrastructure/pdf";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/centris/${name}`, import.meta.url));

async function extract(name: string) {
  const bytes = await readFile(fixture(name));
  return extractCentrisPdfBytes(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), name);
}

describe("importation de plusieurs PDF", () => {
  it("lit une fiche complète de deux pages", async () => {
    const result = await extract("fiche-complete.pdf");
    expect(result.pageCount).toBe(2);
    expect(result.askingPrice.value).toBe(725000);
    expect(result.municipalTaxes.page).toBe(2);
    expect(result.units).toHaveLength(3);
  });

  it("préserve les champs manquants d’une fiche partielle", async () => {
    const result = await extract("fiche-partielle.pdf");
    expect(result.unitCount.value).toBe(2);
    expect(result.potentialAnnualRevenue.value).toBeNull();
    expect(result.units[0].potentialMonthlyRent.status).toBe("missing");
  });

  it("n’invente pas de logements à partir de totaux annuels", async () => {
    const result = await extract("fiche-totaux-seulement.pdf");
    expect(result.currentAnnualRevenue.value).toBe(92000);
    expect(result.potentialAnnualRevenue.value).toBe(105000);
    expect(result.units).toHaveLength(0);
  });

  it("signale une progression ordonnée de 0 à 100 pendant la lecture", async () => {
    const bytes = await readFile(fixture("fiche-complete.pdf"));
    const progress: number[] = [];
    await extractCentrisPdfBytes(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "fiche-complete.pdf",
      (percentage) => progress.push(percentage),
    );

    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(100);
    expect(progress.every((percentage, index) => index === 0 || percentage >= progress[index - 1])).toBe(true);
  });
});
