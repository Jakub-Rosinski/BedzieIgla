export const prerender = false;

import { error, redirect } from "@sveltejs/kit";
import { verifyLink, presignedOriginal } from "$lib/server/inspiracje.js";

/**
 * Link z maila do oryginału inspiracji (#19). Podpis HMAC dowodzi, że link
 * wystawiliśmy my; odpowiedzią jest przekierowanie na presigned URL ważny
 * kilka minut. Bez podpisu — 404, żeby nie zdradzać, które klucze istnieją.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function GET({ params, url, setHeaders }) {
  const key = params.key ?? "";
  if (!verifyLink(key, url.searchParams.get("sig"))) error(404, "Nie znaleziono.");

  const target = await presignedOriginal(key);
  if (!target) error(410, "Zdjęcie zostało usunięte — oryginały przechowujemy 90 dni.");

  setHeaders({ "Cache-Control": "no-store" });
  redirect(302, target);
}
