/**
 * Weryfikacja i sanityzacja załączników obrazkowych.
 *
 * Nagłówek Content-Type przychodzi od klienta i można go dowolnie skłamać —
 * sam w sobie nie gwarantuje, że plik jest obrazem. Podobnie nazwa pliku jest
 * w pełni kontrolowana przez wysyłającego, a trafia prosto do skrzynki jako
 * nazwa załącznika (ryzyko podszycia się, np. "faktura.pdf.exe").
 * Dlatego: rozpoznajemy typ po magic bytes i budujemy nazwę pliku sami.
 */

/** Magic bytes → rozszerzenie i MIME. */
const SIGNATURES = [
  { ext: "jpg", mime: "image/jpeg", test: (/** @type {Uint8Array} */ b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: "png",
    mime: "image/png",
    test: (/** @type {Uint8Array} */ b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    ext: "gif",
    mime: "image/gif",
    test: (/** @type {Uint8Array} */ b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    ext: "webp",
    mime: "image/webp",
    test: (/** @type {Uint8Array} */ b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

/**
 * Rozpoznaje format obrazu po zawartości (magic bytes), ignorując deklarowany
 * Content-Type. Zwraca null, gdy to nie jest obsługiwany obraz.
 * @param {Uint8Array | Buffer} bytes
 * @returns {{ ext: string, mime: string } | null}
 */
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const sig = SIGNATURES.find((s) => s.test(bytes));
  return sig ? { ext: sig.ext, mime: sig.mime } : null;
}

/**
 * Buduje bezpieczną nazwę załącznika: bierze wyłącznie rdzeń nazwy podanej
 * przez użytkownika (bez ścieżek, znaków sterujących i cudzych rozszerzeń),
 * a rozszerzenie dokleja na podstawie realnie rozpoznanego formatu.
 * @param {string} originalName
 * @param {string} ext — rozszerzenie z sniffImageType
 * @param {number} index — numer załącznika (fallback nazwy)
 * @returns {string}
 */
export function safeAttachmentName(originalName, ext, index) {
  const base = String(originalName ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop() ?? "";

  const stem = base
    .replace(/\.[^.]*$/, "")           // utnij oryginalne rozszerzenie
    .replace(/[^\p{L}\p{N} ._-]/gu, "") // tylko litery/cyfry/spacja/kropka/podkreślenie/myślnik
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return `${stem || `inspiracja-${index + 1}`}.${ext}`;
}
