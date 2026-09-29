import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { galleryThumb, isValidName } from "./galeria.js";

const BASE = "https://bucket.example";
const ETAG = "abc123";

/** @type {string} */
let dir;
/** @type {Buffer} */
let original;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "bi-galeria-"));
  vi.stubEnv("GALLERY_CACHE_DIR", dir);
  vi.stubEnv("VITE_S3_PUBLIC_URL", BASE);
  vi.stubEnv("VITE_S3_PREFIX", "gallery/");
  original = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: "#933" } })
    .jpeg()
    .toBuffer();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

/** Udaje S3: HEAD zwraca ETag, GET zwraca oryginał. */
function fakeS3(etag = ETAG) {
  return vi.fn(async (/** @type {string} */ _url, /** @type {RequestInit | undefined} */ init) =>
    init?.method === "HEAD"
      ? new Response(null, { status: 200, headers: { ETag: `"${etag}"` } })
      : new Response(new Uint8Array(original), { status: 200 }),
  );
}

describe("isValidName", () => {
  it("przyjmuje płaskie nazwy plików graficznych", () => {
    expect(isValidName("IMG_5270.JPG")).toBe(true);
    expect(isValidName("kwiat lotosu (2).webp")).toBe(true);
  });

  it("odrzuca ścieżki, ukryte pliki i nie-obrazy", () => {
    expect(isValidName("../queue/x.jpg")).toBe(false);
    expect(isValidName("a/b.jpg")).toBe(false);
    expect(isValidName(".jpg")).toBe(false);
    expect(isValidName("IMG_1596.HEIC")).toBe(false);
    expect(isValidName("skrypt.js")).toBe(false);
  });
});

describe("galleryThumb", () => {
  it("zmniejsza oryginał do WebP pokrywającego kafelek 600×700", async () => {
    const thumb = await galleryThumb("IMG_1.JPG", ETAG, fakeS3());
    expect(thumb).not.toBeNull();
    const meta = await sharp(/** @type {Buffer} */ (thumb)).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 600, height: 800 });
  });

  it("drugie żądanie tej samej wersji idzie z dysku, bez S3", async () => {
    await galleryThumb("IMG_1.JPG", ETAG, fakeS3());
    const s3 = fakeS3();
    expect(await galleryThumb("IMG_1.JPG", ETAG, s3)).not.toBeNull();
    expect(s3).not.toHaveBeenCalled();
  });

  it("nieaktualny ETag kończy się na HEAD — bez pobierania oryginału", async () => {
    const s3 = fakeS3("nowszy");
    expect(await galleryThumb("IMG_1.JPG", ETAG, s3)).toBeNull();
    expect(s3).toHaveBeenCalledTimes(1);
    expect(s3.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it("brak zdjęcia w S3 → null", async () => {
    const s3 = vi.fn(async () => new Response(null, { status: 404 }));
    expect(await galleryThumb("brak.jpg", ETAG, s3)).toBeNull();
  });

  it("niepoprawna nazwa nie dotyka S3", async () => {
    const s3 = fakeS3();
    expect(await galleryThumb("../x.jpg", ETAG, s3)).toBeNull();
    expect(s3).not.toHaveBeenCalled();
  });
});
