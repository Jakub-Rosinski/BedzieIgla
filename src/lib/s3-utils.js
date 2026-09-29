/**
 * Narzędzia do parsowania odpowiedzi S3 ListObjectsV2 (XML).
 * Oddzielone od komponentu dla testowalności — bez zależności od przeglądarki
 * z wyjątkiem DOMParser (dostępnego w każdym nowoczesnym środowisku).
 */

/** Obsługiwane rozszerzenia plików graficznych. */
export const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

/**
 * Nazwy plików nadawane automatycznie przez aparat/telefon/aplikację (po zamianie
 * `-`/`_` na spacje): IMG 5270, DSC 0001, image000000 1, Grafika bez nazwy, UUID…
 * Taki alt nic nie mówi ani czytnikowi ekranu, ani Google Grafika (#53).
 */
const GENERIC_NAME =
  /^(?:(?:img|dsc|dscn|dscf|pxl|mvimg|image|photo|foto|zdjecie|zdjęcie|screenshot|zrzut ekranu|whatsapp image|grafika bez nazwy)[\s\d]*|[0-9a-f]{8}(?: [0-9a-f]{4}){3} [0-9a-f]{12}|[\s\d]+)$/i;

/**
 * Alt zdjęcia galerii. Opisowa nazwa pliku (np. `kwiat-lotosu.jpg`) staje się altem;
 * automatyczna nazwa — opisem ogólnym z numerem pracy, żeby alty się nie powtarzały.
 *
 * @param {string} filename — nazwa pliku bez prefixu i rozszerzenia
 * @param {number} n        — numer pracy (od 1)
 */
export function altFromFilename(filename, n) {
  const words = filename.replace(/[-_]/g, " ").trim();
  return GENERIC_NAME.test(words)
    ? `Tatuaż wykonany w studiu Będzie Igła! w Gliwicach — praca ${n}`
    : words;
}

/**
 * Parsuje odpowiedź XML z S3 ListObjectsV2 i zwraca listę obiektów galerii.
 *
 * Bucket i obiekty muszą mieć ACL "public-read" (grant AllUsers:READ) — OVH nie
 * implementuje bucket policy (IAM-style), GetBucketPolicy zwraca "NotImplemented".
 * Elementy są sortowane alfabetycznie po kluczu, co daje stabilną kolejność
 * niezależnie od kolejności zwracanej przez S3.
 *
 * @param {string} xmlText   — surowy XML z odpowiedzi ListObjectsV2
 * @param {string} prefix    — prefix folderu do odfiltrowania (np. "gallery/")
 * @param {string} publicUrl — bazowy publiczny URL bucketa (trailing slash jest usuwany)
 * @returns {Array<{ url: string, alt: string }>} lista zdjęć gotowa do renderowania
 */
export function parseS3Xml(xmlText, prefix, publicUrl) {
  const baseUrl = publicUrl.replace(/\/$/, ""); // normalizuj URL — usuń trailing slash
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");

  if (doc.querySelector("parsererror")) return [];

  return Array.from(doc.querySelectorAll("Contents Key"))
    .map((el) => el.textContent ?? "")
    .filter((key) => {
      if (key === prefix) return false; // pomiń sam prefix (folder)
      const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
      return IMAGE_EXTS.has(ext);
    })
    .sort()
    .map((key, i) => {
      const filename = key.replace(prefix, "").replace(/\.[^.]+$/, "");
      return {
        url:  `${baseUrl}/${key}`,
        alt:  altFromFilename(filename, i + 1),
      };
    });
}
