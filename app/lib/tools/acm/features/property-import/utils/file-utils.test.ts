import { describe, expect, it } from "vitest";
import { formatFileSize, isPdfFile } from "./file-utils";

describe("formatFileSize", () => {
  it("formate les octets, kilo-octets et megaoctets", () => {
    expect(formatFileSize(900)).toBe("900 o");
    expect(formatFileSize(2048)).toBe("2.0 Ko");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 Mo");
  });
});

describe("isPdfFile", () => {
  it("accepte les fichiers PDF par type MIME ou extension", () => {
    expect(isPdfFile(new File([""], "fiche.pdf", { type: "application/pdf" }))).toBe(true);
    expect(isPdfFile(new File([""], "FICHE.PDF"))).toBe(true);
    expect(isPdfFile(new File([""], "photo.jpg", { type: "image/jpeg" }))).toBe(false);
  });
});
