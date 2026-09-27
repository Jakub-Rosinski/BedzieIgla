export const prerender = false;

import { json } from "@sveltejs/kit";
import { queueHealth } from "$lib/server/queue.js";

/**
 * Sonda dla zewnętrznego monitoringu (#25). Odpowiedź w ogóle = proces Node
 * żyje; 503 = zgłoszenia utykają w kolejce albo leżą w dead/. Szczegóły
 * i uzasadnienie braku testu SMTP — `queueHealth()` w queue.js.
 */
export async function GET() {
  const health = await queueHealth();
  return json(health, {
    status: health.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
