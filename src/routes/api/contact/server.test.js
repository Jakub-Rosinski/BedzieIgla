import { describe, it, expect, vi, beforeEach } from "vitest";

// Endpoint nie wysyła już maila sam — jego kontraktem jest PRZYJĘCIE zgłoszenia
// do trwałej kolejki. Samą wysyłkę i ponawianie pokrywa queue.test.js.
const enqueueMock = vi.fn();
vi.mock("$lib/server/queue.js", () => ({
  enqueue: (/** @type {any} */ args) => enqueueMock(args),
}));

import { POST } from "./+server.js";
import { __testing as rateLimitTesting } from "$lib/server/rate-limit.js";

const VALID_FIELDS = {
  name: "Anna Kowalska",
  email: "anna@test.pl",
  phone: "531 269 735",
  miejsce: "przedramię",
  wielkosc: "małe",
  message: "Chciałabym umówić się na konsultację tatuażu.",
};

// Stubbing request.formData() directly (rather than round-tripping a real
// multipart body through Request/FormData) sidesteps jsdom's incomplete
// multipart/File support and tests the route's own logic in isolation.
/** @param {Record<string,string>} fields @param {File[]} files */
function makeFormData(fields, files = []) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append("inspiracje", f, f.name);
  return fd;
}

/** @param {Record<string,string>} fields @param {File[]} files @param {string} [ip] */
function makeEvent(fields, files = [], ip = "1.2.3.4") {
  const fd = makeFormData(fields, files);
  return {
    request: { formData: async () => fd },
    getClientAddress: () => ip,
  };
}

function farEnoughFirstInteraction() {
  return String(Date.now() - 5000); // 5s ago — past MIN_FILL_MS (3s)
}

/** Minimal valid JPEG payload (magic bytes + padding) for attachment tests. */
function jpegFile(name = "inspiracja.jpg") {
  const bytes = new Uint8Array(32);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return new File([bytes], name, { type: "image/jpeg" });
}

beforeEach(() => {
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue("id-testowe");
  rateLimitTesting.sends.clear();
  rateLimitTesting.attempts.clear();
});

describe("POST /api/contact — poprawne zgłoszenie", () => {
  it("przyjmuje zgłoszenie do kolejki i zwraca { ok: true }", async () => {
    const event = makeEvent({ ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() });
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock.mock.calls[0][0]).toMatchObject(VALID_FIELDS);
  });

  it("przekazuje pliki do kolejki jako bufory z rozpoznanym typem", async () => {
    const event = makeEvent(
      { ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() },
      [jpegFile()]
    );
    await POST(/** @type {any} */ (event));

    const { attachments } = enqueueMock.mock.calls[0][0];
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe("inspiracja.jpg");
    expect(attachments[0].contentType).toBe("image/jpeg");
    expect(Buffer.isBuffer(attachments[0].content)).toBe(true);
  });

  // Regresja: wcześniej odpowiedź czekała na SMTP i zwracała 502 przy jego
  // awarii, kasując treść i zdjęcia. Teraz potwierdzamy PRZYJĘCIE zgłoszenia.
  it("nie czeka na wysyłkę maila — potwierdza przyjęcie, nie doręczenie", async () => {
    const event = makeEvent({ ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() });
    const res = await POST(/** @type {any} */ (event));

    expect(res.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/contact — walidacja (reuse form-utils.validate)", () => {
  it("zwraca 400 gdy brak wymaganego pola", async () => {
    const event = makeEvent({
      ...VALID_FIELDS,
      email: "",
      firstInteractionAt: farEnoughFirstInteraction(),
    });
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/e-mail/i);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/contact — antyspam", () => {
  it("honeypot ustawiony → ciche 200 bez kolejkowania", async () => {
    const event = makeEvent({
      ...VALID_FIELDS,
      botcheck: "1",
      firstInteractionAt: farEnoughFirstInteraction(),
    });
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("zbyt szybkie wypełnienie → ciche 200 bez kolejkowania", async () => {
    const event = makeEvent({ ...VALID_FIELDS, firstInteractionAt: String(Date.now()) });
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("całkowity brak pola firstInteractionAt → ciche 200 (bot strzelający w API)", async () => {
    // Nasz formularz zawsze wysyła to pole; jego brak = żądanie spoza formularza.
    const event = makeEvent({ ...VALID_FIELDS });
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("firstInteractionAt=0 jest dopuszczone (np. autofill bez zdarzenia input)", async () => {
    const event = makeEvent({ ...VALID_FIELDS, firstInteractionAt: "0" });
    const res = await POST(/** @type {any} */ (event));

    expect(res.status).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/contact — załączniki", () => {
  it("odrzuca plik przekraczający 5 MB", async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    const event = makeEvent(
      { ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() },
      [big]
    );
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/5 MB/);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("odrzuca plik o niedozwolonym typie MIME", async () => {
    const txt = new File(["nie obraz"], "notes.txt", { type: "text/plain" });
    const event = makeEvent(
      { ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() },
      [txt]
    );
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/nie jest obsługiwanym obrazem/i);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("odrzuca plik NIE-obraz mimo skłamanego Content-Type: image/jpeg", async () => {
    const fake = new File(["MZ to plik wykonywalny, nie obraz"], "payload.exe", {
      type: "image/jpeg",
    });
    const event = makeEvent(
      { ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() },
      [fake]
    );
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/nie jest obsługiwanym obrazem/i);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("sanityzuje nazwę załącznika kontrolowaną przez wysyłającego", async () => {
    const event = makeEvent(
      { ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() },
      [jpegFile("../../payload.exe")]
    );
    await POST(/** @type {any} */ (event));

    expect(enqueueMock.mock.calls[0][0].attachments[0].filename).toBe("payload.jpg");
  });
});

describe("POST /api/contact — rate limiting", () => {
  it("blokuje po przekroczeniu limitu wysyłek z tego samego IP", async () => {
    const ip = "9.9.9.9";
    for (let i = 0; i < rateLimitTesting.MAX_SENDS_PER_IP; i++) {
      const event = makeEvent(
        { ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() },
        [],
        ip
      );
      const res = await POST(/** @type {any} */ (event));
      expect(res.status).toBe(200);
    }

    const blocked = makeEvent(
      { ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() },
      [],
      ip
    );
    const res = await POST(/** @type {any} */ (blocked));
    expect(res.status).toBe(429);
    expect(enqueueMock).toHaveBeenCalledTimes(rateLimitTesting.MAX_SENDS_PER_IP);
  });

  // Regresja: wcześniej licznik rósł WYŁĄCZNIE po udanej wysyłce, więc żądania
  // odrzucane przy walidacji nie były limitowane w ogóle — można było zalewać
  // endpoint dowolną liczbą 25 MB multipartów.
  it("limituje również żądania odrzucane przy walidacji (ochrona przed floodem)", async () => {
    const ip = "9.8.7.6";
    const invalid = () =>
      makeEvent(
        { ...VALID_FIELDS, email: "NOTANEMAIL", firstInteractionAt: farEnoughFirstInteraction() },
        [],
        ip
      );

    for (let i = 0; i < rateLimitTesting.MAX_ATTEMPTS_PER_IP; i++) {
      const res = await POST(/** @type {any} */ (invalid()));
      expect(res.status).toBe(400);
    }

    const res = await POST(/** @type {any} */ (invalid()));
    expect(res.status).toBe(429);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/contact — awaria zapisu kolejki", () => {
  it("zwraca 500, gdy zgłoszenia nie da się utrwalić", async () => {
    // Jedyny pozostały tryb awarii: dysk pełny lub brak uprawnień. Nie wolno
    // wtedy udawać sukcesu, bo zgłoszenie faktycznie przepadłoby.
    enqueueMock.mockRejectedValueOnce(new Error("ENOSPC"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const event = makeEvent({ ...VALID_FIELDS, firstInteractionAt: farEnoughFirstInteraction() });
    const res = await POST(/** @type {any} */ (event));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBeTruthy();
  });
});
