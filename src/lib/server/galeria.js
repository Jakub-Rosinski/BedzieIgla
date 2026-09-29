import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { IMAGE_EXTS } from "$lib/s3-utils.js";

/**
 * Miniatury zdjęć galerii (#58). Oryginały w S3 mają po 0,2–1,6 MB, a kafelek
 * karuzeli ma 280×320 px (200×230 na telefonie) — strona ważyła przez to 9 MB.
 *
 * Miniatura powstaje raz na wersję zdjęcia (nazwa + ETag z S3) i trafia na dysk;
 * kolejne wejścia czytają plik. Adres jest wersjonowany ETagiem, więc przeglądarka
 * może trzymać go w cache na zawsze.
 *
 * Obrona przed nadużyciem: nazwa musi być płaskim plikiem graficznym (bez `/`, bez
 * `..`), a przed pobraniem oryginału robimy tani HEAD i porównujemy ETag — losowe
 * `?v=` kończą się 404 bez ściągania megabajtów i bez pracy sharpa.
 */

/** Kafelek 280×320 przy ekranie 2× → pokrywamy co najmniej 600×700. */
const THUMB_W = 600;
const THUMB_H = 700;

const NAME_RE = /^[\p{L}\p{N} ._()-]{1,200}$/u;

function cacheRoot() {
  return process.env.GALLERY_CACHE_DIR || path.join("cache", "galeria");
}

function sourceBase() {
  return (import.meta.env.VITE_S3_PUBLIC_URL ?? "").replace(/\/$/, "");
}

function sourcePrefix() {
  return import.meta.env.VITE_S3_PREFIX || "gallery/";
}

/** @param {string} name */
export function isValidName(name) {
  if (!NAME_RE.test(name) || name.startsWith(".")) return false;
  return IMAGE_EXTS.has(name.slice(name.lastIndexOf(".") + 1).toLowerCase());
}

/**
 * Zmniejsza oryginał do WebP: obrót wg EXIF, metadane (w tym GPS) usunięte,
 * pokrycie co najmniej THUMB_W×THUMB_H bez powiększania małych zdjęć.
 *
 * @param {Buffer} original
 */
export function makeThumb(original) {
  return sharp(original)
    .rotate()
    .resize(THUMB_W, THUMB_H, { fit: "outside", withoutEnlargement: true })
    .webp({ quality: 75 })
    .toBuffer();
}

/**
 * Zwraca miniaturę zdjęcia `name` w wersji `version` (ETag bez cudzysłowów)
 * albo `null`, gdy takiego zdjęcia/wersji nie ma.
 *
 * @param {string} name
 * @param {string} version
 * @param {(url: string, init?: RequestInit) => Promise<Response>} [fetchImpl]
 * @returns {Promise<Buffer | null>}
 */
export async function galleryThumb(name, version, fetchImpl = fetch) {
  const base = sourceBase();
  if (!base || !version || !isValidName(name)) return null;

  const id = createHash("sha256").update(`${name}\0${version}`).digest("hex");
  const file = path.join(cacheRoot(), `${id}.webp`);
  try {
    return await fs.readFile(file);
  } catch {
    // brak w cache — generujemy
  }

  const src = `${base}/${sourcePrefix()}${encodeURIComponent(name)}`;
  const head = await fetchImpl(src, { method: "HEAD" });
  if (!head.ok || (head.headers.get("etag") ?? "").replace(/"/g, "") !== version) return null;

  const res = await fetchImpl(src);
  if (!res.ok) return null;
  const thumb = await makeThumb(Buffer.from(await res.arrayBuffer()));

  // tmp + rename: równoległe żądania nie zobaczą w cache połowy pliku.
  await fs.mkdir(cacheRoot(), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, thumb);
  await fs.rename(tmp, file);
  return thumb;
}
