export const prerender = false;

import { json } from "@sveltejs/kit";
import { validate, isBotSubmission } from "$lib/form-utils.js";
import { checkRateLimit, recordAttempt, recordSend } from "$lib/server/rate-limit.js";
import { sniffImageType, safeAttachmentName } from "$lib/server/image-utils.js";
import { enqueue } from "$lib/server/queue.js";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB / plik
const MAX_FILES = 6;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024; // łącznie — zapas pod limit Gmaila (~25 MB po base64)

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST({ request, getClientAddress }) {
  const ip = getClientAddress();

  // Licznik żądań — ZANIM sparsujemy body, żeby flood dużych multipartów
  // (odrzucanych dopiero przy walidacji) też był ograniczany.
  if (!recordAttempt(ip).allowed) {
    return json({ error: "Zbyt wiele żądań. Spróbuj ponownie za chwilę." }, { status: 429 });
  }

  // Limit realnych wysyłek
  if (!checkRateLimit(ip).allowed) {
    return json({ error: "Zbyt wiele zgłoszeń. Spróbuj ponownie za chwilę." }, { status: 429 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Nieprawidłowe dane formularza." }, { status: 400 });
  }

  // Honeypot — bot zaznaczył ukryte pole. Cicha "sukces" odpowiedź, jak po stronie klienta.
  if (form.get("botcheck")) {
    return json({ ok: true });
  }

  // Nasz formularz ZAWSZE wysyła to pole (choćby jako "0"). Jego całkowity brak
  // oznacza, że żądanie nie pochodzi z formularza — typowy bot strzelający
  // prosto w API. Wartość 0 dopuszczamy (np. autofill bez zdarzenia input).
  if (!form.has("firstInteractionAt")) {
    return json({ ok: true });
  }
  if (isBotSubmission(Number(form.get("firstInteractionAt") ?? 0))) {
    return json({ ok: true });
  }

  const name = String(form.get("name") ?? "");
  const email = String(form.get("email") ?? "");
  const phone = String(form.get("phone") ?? "");
  const miejsce = String(form.get("miejsce") ?? "");
  const wielkosc = String(form.get("wielkosc") ?? "");
  const message = String(form.get("message") ?? "");

  const validationError = validate(name, email, phone, message, miejsce, wielkosc);
  if (validationError) {
    return json({ error: validationError }, { status: 400 });
  }

  const files = /** @type {File[]} */ (
    form.getAll("inspiracje").filter((f) => f instanceof File && f.size > 0)
  );

  if (files.length > MAX_FILES) {
    return json({ error: `Maksymalnie ${MAX_FILES} plików.` }, { status: 400 });
  }

  let totalBytes = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return json({ error: `Plik "${file.name}" przekracza 5 MB.` }, { status: 400 });
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return json(
      { error: "Inspiracje są za duże łącznie — prześlij mniej plików lub mniejsze obrazy." },
      { status: 400 }
    );
  }

  // Typ rozpoznajemy po zawartości, nie po deklarowanym Content-Type,
  // a nazwę załącznika budujemy sami (patrz image-utils.js).
  /** @type {{ filename: string, content: Buffer, contentType: string }[]} */
  const attachments = [];
  for (const [index, file] of files.entries()) {
    const content = Buffer.from(await file.arrayBuffer());
    const kind = sniffImageType(content);
    if (!kind) {
      return json({ error: `Plik "${file.name}" nie jest obsługiwanym obrazem.` }, { status: 400 });
    }
    attachments.push({
      filename: safeAttachmentName(file.name, kind.ext, index),
      content,
      contentType: kind.mime,
    });
  }

  // Zgłoszenie trafia na dysk, a wysyłką zajmuje się worker kolejki.
  // Odpowiedź dla klienta potwierdza PRZYJĘCIE zgłoszenia, nie doręczenie
  // maila — dzięki temu niedostępny SMTP nie kasuje treści ani zdjęć.
  try {
    await enqueue({ name, email, phone, miejsce, wielkosc, message, attachments });
  } catch (err) {
    // Tu dociera już tylko awaria zapisu na dysk (brak miejsca, brak uprawnień).
    // Nie możemy zagwarantować trwałości, więc nie wolno udawać sukcesu.
    console.error("Nie udało się zapisać zgłoszenia w kolejce:", err);
    return json(
      { error: "Nie udało się przyjąć zgłoszenia. Spróbuj ponownie później." },
      { status: 500 }
    );
  }

  recordSend(ip);
  return json({ ok: true });
}
