export const prerender = false;

import { error } from "@sveltejs/kit";
import { galleryThumb } from "$lib/server/galeria.js";

/**
 * Miniatura zdjęcia galerii (#58): `/api/galeria/<plik>?v=<ETag>`.
 * Adres jest wersjonowany ETagiem, więc odpowiedź może być cache'owana na zawsze.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function GET({ params, url }) {
  let thumb;
  try {
    thumb = await galleryThumb(params.name ?? "", url.searchParams.get("v") ?? "");
  } catch (err) {
    console.error(`[galeria] miniatura ${params.name}:`, err);
    error(502, "Nie udało się przygotować miniatury.");
  }
  if (!thumb) error(404, "Nie znaleziono.");

  return new Response(new Uint8Array(thumb), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
