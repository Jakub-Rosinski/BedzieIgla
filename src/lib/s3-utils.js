/**
 * Narzędzia do parsowania odpowiedzi S3 ListObjectsV2 (XML).
 * Oddzielone od komponentu dla testowalności — bez zależności od przeglądarki
 * z wyjątkiem DOMParser (dostępnego w każdym nowoczesnym środowisku).
 */

/** Obsługiwane rozszerzenia plików graficznych. */
export const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

/**
 * Parsuje odpowiedź XML z S3 ListObjectsV2 i zwraca listę obiektów galerii.
 *
 * Bucket musi mieć politykę s3:ListBucket dla Principal "*" (publiczne listowanie).
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
    .map((key) => {
      const filename = key.replace(prefix, "").replace(/\.[^.]+$/, "");
      return {
        url:  `${baseUrl}/${key}`,
        alt:  filename.replace(/[-_]/g, " "),
      };
    });
}
