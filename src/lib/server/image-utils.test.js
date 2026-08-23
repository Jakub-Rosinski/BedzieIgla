import { describe, it, expect } from "vitest";
import { sniffImageType, safeAttachmentName } from "./image-utils.js";

/** @param {number[]} head */
const buf = (head, pad = 16) =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(Math.max(0, pad - head.length))]);

const JPEG = buf([0xff, 0xd8, 0xff, 0xe0]);
const PNG = buf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = buf([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = buf([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("sniffImageType", () => {
  it("rozpoznaje JPEG/PNG/GIF/WebP po magic bytes", () => {
    expect(sniffImageType(JPEG)).toEqual({ ext: "jpg", mime: "image/jpeg" });
    expect(sniffImageType(PNG)).toEqual({ ext: "png", mime: "image/png" });
    expect(sniffImageType(GIF)).toEqual({ ext: "gif", mime: "image/gif" });
    expect(sniffImageType(WEBP)).toEqual({ ext: "webp", mime: "image/webp" });
  });

  it("odrzuca zawartość, która nie jest obrazem, mimo skłamanego Content-Type", () => {
    expect(sniffImageType(Buffer.from("MZ to nie jest obraz, tylko plik wykonywalny"))).toBeNull();
    expect(sniffImageType(Buffer.from("%PDF-1.7 ......................"))).toBeNull();
  });

  it("odrzuca zbyt krótkie / puste dane", () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe("safeAttachmentName", () => {
  it("wymusza rozszerzenie zgodne z realnym formatem", () => {
    expect(safeAttachmentName("payload.exe", "jpg", 0)).toBe("payload.jpg");
    expect(safeAttachmentName("faktura.pdf", "png", 0)).toBe("faktura.png");
  });

  it("usuwa ścieżki (path traversal)", () => {
    expect(safeAttachmentName("../../etc/passwd", "jpg", 0)).toBe("passwd.jpg");
    expect(safeAttachmentName("C:\\Windows\\System32\\evil.dll", "png", 0)).toBe("evil.png");
  });

  it("usuwa znaki sterujące i CR/LF (ochrona nagłówków MIME)", () => {
    expect(safeAttachmentName("a\r\nX-Evil: 1.jpg", "jpg", 0)).toBe("aX-Evil 1.jpg");
    expect(safeAttachmentName("zdjęcie\u0000.jpg", "jpg", 0)).toBe("zdjęcie.jpg");
  });

  it("zachowuje polskie znaki i sensowne nazwy", () => {
    expect(safeAttachmentName("wzór tatuażu.JPG", "jpg", 0)).toBe("wzór tatuażu.jpg");
  });

  it("nadaje nazwę zastępczą gdy nic nie zostanie", () => {
    expect(safeAttachmentName("!!!.jpg", "jpg", 0)).toBe("inspiracja-1.jpg");
    expect(safeAttachmentName("", "png", 2)).toBe("inspiracja-3.png");
  });

  it("ogranicza długość nazwy", () => {
    const long = "a".repeat(200) + ".jpg";
    const out = safeAttachmentName(long, "jpg", 0);
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.endsWith(".jpg")).toBe(true);
  });
});
