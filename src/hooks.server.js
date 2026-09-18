/**
 * Kod na poziomie modułu wykonuje się raz, przy starcie procesu serwera —
 * to właściwe miejsce na uruchomienie workera kolejki.
 *
 * Strażnik `building` jest konieczny: ten plik jest importowany także podczas
 * prerenderowania strony w trakcie builda. Bez niego `pnpm build` startowałby
 * workera kolejki na maszynie CI.
 */

import { building } from "$app/environment";
import { startQueueWorker } from "$lib/server/queue.js";

if (!building) {
  startQueueWorker();
}
