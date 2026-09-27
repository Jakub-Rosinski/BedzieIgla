import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { inspirationLink, verifyLink, thumbnail } from "./inspiracje.js";

beforeEach(() => {
  vi.stubEnv("LINK_SECRET", "test-secret");
  vi.stubEnv("ORIGIN", "https://bedzieigla.pl");
});
afterEach(() => vi.unstubAllEnvs());

/** @param {string} key */
function sigOf(key) {
  return new URL(inspirationLink(key)).searchParams.get("sig");
}

describe("inspiracje — podpisane linki", () => {
  it("link z maila prowadzi do endpointu i przechodzi weryfikację", () => {
    const key = "1790000000000-abc/1-tatuaz ramie.jpg";
    const url = new URL(inspirationLink(key));

    expect(url.origin).toBe("https://bedzieigla.pl");
    expect(decodeURIComponent(url.pathname)).toBe(`/api/inspiracje/${key}`);
    expect(verifyLink(key, url.searchParams.get("sig"))).toBe(true);
  });

  it("odrzuca brak podpisu, podpis innego klucza i podpis innym sekretem", () => {
    const key = "job-a/1-a.jpg";
    expect(verifyLink(key, null)).toBe(false);
    expect(verifyLink(key, sigOf("job-b/1-a.jpg"))).toBe(false);

    const sig = sigOf(key);
    vi.stubEnv("LINK_SECRET", "inny-sekret");
    expect(verifyLink(key, sig)).toBe(false);
  });

  it("bez LINK_SECRET nie wystawia linków (zamiast podpisywać pustym kluczem)", () => {
    vi.stubEnv("LINK_SECRET", "");
    expect(() => inspirationLink("a/1-a.jpg")).toThrow(/LINK_SECRET/);
  });
});

describe("inspiracje — miniatury", () => {
  it("zmniejsza do 800 px dłuższego boku i zapisuje jako JPEG bez metadanych", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bi-thumb-"));
    const file = path.join(dir, "duze.png");
    await sharp({ create: { width: 3000, height: 1500, channels: 3, background: "#c33" } })
      .withMetadata({ exif: { IFD0: { Copyright: "klient" } } })
      .png()
      .toFile(file);

    const meta = await sharp(await thumbnail(file)).metadata();
    await fs.rm(dir, { recursive: true, force: true });

    expect(meta).toMatchObject({ format: "jpeg", width: 800, height: 400 });
    expect(meta.exif).toBeUndefined();
  });
});
