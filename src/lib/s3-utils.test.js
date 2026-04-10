import { describe, it, expect } from "vitest";
import { parseS3Xml, IMAGE_EXTS } from "./s3-utils.js";

const PUBLIC_URL = "https://bedzie-igla.s3.waw.perf.cloud.ovh.net";
const PREFIX     = "gallery/";

// ─── Pomocnicze budowanie XML ─────────────────────────────────────────────────

/** @param {string[]} keys */
function buildXml(keys) {
  const items = keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join("");
  return `<?xml version="1.0"?><ListBucketResult>${items}</ListBucketResult>`;
}

// ─── IMAGE_EXTS ───────────────────────────────────────────────────────────────

describe("IMAGE_EXTS", () => {
  it("zawiera obsługiwane formaty graficzne", () => {
    expect(IMAGE_EXTS.has("jpg")).toBe(true);
    expect(IMAGE_EXTS.has("jpeg")).toBe(true);
    expect(IMAGE_EXTS.has("png")).toBe(true);
    expect(IMAGE_EXTS.has("webp")).toBe(true);
    expect(IMAGE_EXTS.has("gif")).toBe(true);
    expect(IMAGE_EXTS.has("avif")).toBe(true);
  });

  it("nie zawiera dokumentów ani archiwów", () => {
    expect(IMAGE_EXTS.has("pdf")).toBe(false);
    expect(IMAGE_EXTS.has("zip")).toBe(false);
    expect(IMAGE_EXTS.has("txt")).toBe(false);
    expect(IMAGE_EXTS.has("mp4")).toBe(false);
  });
});

// ─── parseS3Xml — poprawny XML ────────────────────────────────────────────────

describe("parseS3Xml — poprawne dane", () => {
  it("zwraca puste tablicę dla pustego bucketa (brak Contents)", () => {
    const xml = `<?xml version="1.0"?><ListBucketResult></ListBucketResult>`;
    expect(parseS3Xml(xml, PREFIX, PUBLIC_URL)).toEqual([]);
  });

  it("parsuje pojedyncze zdjęcie jpg", () => {
    const xml = buildXml(["gallery/tattoo.jpg"]);
    const result = parseS3Xml(xml, PREFIX, PUBLIC_URL);

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe(`${PUBLIC_URL}/gallery/tattoo.jpg`);
    expect(result[0].alt).toBe("tattoo");
  });

  it("parsuje wszystkie obsługiwane formaty", () => {
    const keys = [
      "gallery/a.jpg",
      "gallery/b.jpeg",
      "gallery/c.png",
      "gallery/d.webp",
      "gallery/e.gif",
      "gallery/f.avif",
    ];
    const result = parseS3Xml(buildXml(keys), PREFIX, PUBLIC_URL);
    expect(result).toHaveLength(6);
  });

  it("pomija nieobsługiwane formaty (pdf, mp4, txt)", () => {
    const keys = [
      "gallery/photo.jpg",
      "gallery/dokument.pdf",
      "gallery/wideo.mp4",
      "gallery/notes.txt",
    ];
    const result = parseS3Xml(buildXml(keys), PREFIX, PUBLIC_URL);
    expect(result).toHaveLength(1);
    expect(result[0].alt).toBe("photo");
  });

  it("pomija sam klucz prefix (folder marker)", () => {
    const keys = ["gallery/", "gallery/photo.jpg"];
    const result = parseS3Xml(buildXml(keys), PREFIX, PUBLIC_URL);
    expect(result).toHaveLength(1);
  });

  it("sortuje wyniki alfabetycznie po kluczu S3", () => {
    const keys = ["gallery/z-tattoo.jpg", "gallery/a-tattoo.jpg", "gallery/m-tattoo.jpg"];
    const result = parseS3Xml(buildXml(keys), PREFIX, PUBLIC_URL);
    expect(result[0].alt).toBe("a tattoo");
    expect(result[1].alt).toBe("m tattoo");
    expect(result[2].alt).toBe("z tattoo");
  });

  it("zamienia myślniki i podkreślniki na spacje w alt", () => {
    const keys = [
      "gallery/kwiat-lotosu.jpg",
      "gallery/waz_owijajacy_sie.png",
    ];
    const result = parseS3Xml(buildXml(keys), PREFIX, PUBLIC_URL);
    expect(result[0].alt).toBe("kwiat lotosu");
    expect(result[1].alt).toBe("waz owijajacy sie");
  });

  it("buduje poprawny publiczny URL", () => {
    const xml = buildXml(["gallery/sleeve.webp"]);
    const result = parseS3Xml(xml, PREFIX, PUBLIC_URL);
    expect(result[0].url).toBe(`${PUBLIC_URL}/gallery/sleeve.webp`);
  });

  it("usuwa prefix z alt tekstu", () => {
    const xml = buildXml(["gallery/moj-projekt.jpg"]);
    const result = parseS3Xml(xml, PREFIX, PUBLIC_URL);
    expect(result[0].alt).not.toContain("gallery");
    expect(result[0].alt).toBe("moj projekt");
  });

  it("obsługuje rozszerzenia pisane wielką literą (case-insensitive)", () => {
    const keys = ["gallery/foto.JPG", "gallery/img.PNG"];
    const result = parseS3Xml(buildXml(keys), PREFIX, PUBLIC_URL);
    expect(result).toHaveLength(2);
  });
});

// ─── parseS3Xml — błędne dane ─────────────────────────────────────────────────

describe("parseS3Xml — błędne dane wejściowe", () => {
  it("zwraca puste tablicę dla niepoprawnego XML", () => {
    const result = parseS3Xml("<nie-zamkniety-tag", PREFIX, PUBLIC_URL);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("zwraca puste tablicę dla pustego stringa", () => {
    const result = parseS3Xml("", PREFIX, PUBLIC_URL);
    expect(result).toEqual([]);
  });

  it("zwraca puste tablicę gdy brak elementów Contents", () => {
    const xml = `<ListBucketResult><Name>bucket</Name><Prefix>gallery/</Prefix></ListBucketResult>`;
    expect(parseS3Xml(xml, PREFIX, PUBLIC_URL)).toEqual([]);
  });
});

// ─── parseS3Xml — wiele obiektów ─────────────────────────────────────────────

describe("parseS3Xml — realny scenariusz galerii", () => {
  it("parsuje typową odpowiedź S3 z 10 zdjęciami", () => {
    const keys = Array.from({ length: 10 }, (_, i) => `gallery/tattoo-${i + 1}.jpg`);
    const result = parseS3Xml(buildXml(keys), PREFIX, PUBLIC_URL);

    expect(result).toHaveLength(10);
    result.forEach((photo) => {
      expect(photo.url).toMatch(/^https:\/\//);
      expect(photo.alt).toBeTruthy();
      expect(photo.alt).not.toContain("gallery");
      expect(photo.alt).not.toContain(".jpg");
    });
  });

  it("działa poprawnie gdy prefix jest na początku kluczy", () => {
    const xml = buildXml(["gallery/img1.jpg", "gallery/img2.png"]);
    const result = parseS3Xml(xml, "gallery/", PUBLIC_URL);

    expect(result[0].alt).toBe("img1");
    expect(result[1].alt).toBe("img2");
  });
});
