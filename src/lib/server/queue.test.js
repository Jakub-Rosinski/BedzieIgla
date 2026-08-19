import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const sendContactEmailMock = vi.fn();
vi.mock("./mailer.js", () => ({
  sendContactEmail: (/** @type {any} */ args) => sendContactEmailMock(args),
}));

import { enqueue, processDue, __testing } from "./queue.js";

/** @type {string} */
let root;

const VALID = {
  name: "Anna Kowalska",
  email: "anna@test.pl",
  phone: "531 269 735",
  miejsce: "przedramię",
  wielkosc: "małe",
  message: "Chciałabym umówić się na konsultację.",
};

/**
 * Odczytuje job.json jedynego zgłoszenia w podanym katalogu.
 * @param {string} dir
 */
async function readOnlyJob(dir) {
  const ids = await fs.readdir(dir);
  expect(ids).toHaveLength(1);
  return {
    id: ids[0],
    job: JSON.parse(await fs.readFile(path.join(dir, ids[0], "job.json"), "utf8")),
  };
}

/**
 * Cofa zegar zgłoszenia, żeby dojrzało bez czekania.
 * @param {string} id
 */
async function makeDue(id) {
  const file = path.join(__testing.pendingDir(), id, "job.json");
  const job = JSON.parse(await fs.readFile(file, "utf8"));
  job.nextAttemptAt = 0;
  await fs.writeFile(file, JSON.stringify(job), "utf8");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "bi-queue-"));
  vi.stubEnv("QUEUE_DIR", root);
  sendContactEmailMock.mockReset();
  sendContactEmailMock.mockResolvedValue(undefined);
  __testing.inFlight.clear();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe("kolejka — przyjmowanie zgłoszeń", () => {
  it("zapisuje zgłoszenie na dysk, zanim cokolwiek zostanie wysłane", async () => {
    await enqueue({ ...VALID, attachments: [] });

    const { job } = await readOnlyJob(__testing.pendingDir());
    expect(job.fields).toEqual(VALID);
    expect(job.attempts).toBe(0);
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });

  it("zapisuje załączniki bajt w bajt", async () => {
    const content = crypto.randomBytes(4096);
    await enqueue({
      ...VALID,
      attachments: [{ filename: "inspiracja.jpg", content, contentType: "image/jpeg" }],
    });

    const { id, job } = await readOnlyJob(__testing.pendingDir());
    const stored = await fs.readFile(path.join(__testing.pendingDir(), id, job.attachments[0].file));
    expect(Buffer.compare(stored, content)).toBe(0);
    expect(job.attachments[0].filename).toBe("inspiracja.jpg");
  });

  it("nie zostawia katalogu przejściowego po sobie", async () => {
    await enqueue({ ...VALID, attachments: [] });
    const leftovers = (await fs.readdir(root)).filter((n) => n.startsWith(".staging-"));
    expect(leftovers).toEqual([]);
  });
});

describe("kolejka — wysyłka", () => {
  it("wysyła dojrzałe zgłoszenie i usuwa je z kolejki", async () => {
    await enqueue({ ...VALID, attachments: [] });
    const stats = await processDue();

    expect(stats.sent).toBe(1);
    expect(sendContactEmailMock).toHaveBeenCalledTimes(1);
    expect(sendContactEmailMock.mock.calls[0][0].email).toBe(VALID.email);
    expect(await fs.readdir(__testing.pendingDir())).toEqual([]);
  });

  it("odtwarza załączniki przy wysyłce", async () => {
    const content = crypto.randomBytes(2048);
    await enqueue({
      ...VALID,
      attachments: [{ filename: "a.jpg", content, contentType: "image/jpeg" }],
    });
    await processDue();

    const sent = sendContactEmailMock.mock.calls[0][0].attachments[0];
    expect(Buffer.compare(sent.content, content)).toBe(0);
    expect(sent.contentType).toBe("image/jpeg");
  });

  it("pomija zgłoszenie, którego czas ponowienia jeszcze nie nadszedł", async () => {
    await enqueue({ ...VALID, attachments: [] });
    const { id } = await readOnlyJob(__testing.pendingDir());

    const file = path.join(__testing.pendingDir(), id, "job.json");
    const job = JSON.parse(await fs.readFile(file, "utf8"));
    job.nextAttemptAt = Date.now() + 60_000;
    await fs.writeFile(file, JSON.stringify(job), "utf8");

    expect((await processDue()).sent).toBe(0);
    expect(sendContactEmailMock).not.toHaveBeenCalled();
  });
});

describe("kolejka — ponawianie", () => {
  it("po nieudanej wysyłce zachowuje zgłoszenie i planuje ponowienie", async () => {
    sendContactEmailMock.mockRejectedValue(new Error("SMTP niedostępny"));
    await enqueue({ ...VALID, attachments: [] });

    const stats = await processDue();
    expect(stats.failed).toBe(1);

    const { job } = await readOnlyJob(__testing.pendingDir());
    expect(job.attempts).toBe(1);
    expect(job.lastError).toBe("SMTP niedostępny");
    expect(job.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it("odstępy między próbami rosną", async () => {
    sendContactEmailMock.mockRejectedValue(new Error("nadal padnięte"));
    await enqueue({ ...VALID, attachments: [] });

    /** @type {number[]} */
    const odstepy = [];
    for (let i = 0; i < 3; i++) {
      const { id } = await readOnlyJob(__testing.pendingDir());
      await makeDue(id);
      const przed = Date.now();
      await processDue();
      const { job } = await readOnlyJob(__testing.pendingDir());
      odstepy.push(job.nextAttemptAt - przed);
    }

    expect(odstepy[1]).toBeGreaterThan(odstepy[0]);
    expect(odstepy[2]).toBeGreaterThan(odstepy[1]);
  });

  it("dowozi zgłoszenie, gdy SMTP wróci — bez ingerencji", async () => {
    sendContactEmailMock.mockRejectedValueOnce(new Error("chwilowa awaria"));
    await enqueue({ ...VALID, attachments: [] });

    await processDue(); // pierwsza próba pada
    expect(await fs.readdir(__testing.pendingDir())).toHaveLength(1);

    const { id } = await readOnlyJob(__testing.pendingDir());
    await makeDue(id);
    await processDue(); // SMTP wrócił

    expect(sendContactEmailMock).toHaveBeenCalledTimes(2);
    expect(await fs.readdir(__testing.pendingDir())).toEqual([]);
  });

  it("po wyczerpaniu prób przenosi zgłoszenie do dead/, nie kasuje go", async () => {
    sendContactEmailMock.mockRejectedValue(new Error("trwała awaria"));
    const alert = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await enqueue({ ...VALID, attachments: [] });
    for (let i = 0; i < __testing.MAX_ATTEMPTS; i++) {
      const ids = await fs.readdir(__testing.pendingDir());
      if (ids.length === 0) break;
      await makeDue(ids[0]);
      await processDue();
    }

    expect(await fs.readdir(__testing.pendingDir())).toEqual([]);

    const { job } = await readOnlyJob(__testing.deadDir());
    expect(job.attempts).toBe(__testing.MAX_ATTEMPTS);
    expect(job.fields.email).toBe(VALID.email); // treść zgłoszenia zachowana
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("ALERT"));
  });
});

describe("kolejka — trwałość", () => {
  it("podejmuje zgłoszenia zaległe z poprzedniego uruchomienia procesu", async () => {
    // enqueue + brak przetworzenia = dokładnie taki stan, w jakim restart
    // (pm2 reload, reboot VPS) zostawia kolejkę.
    await enqueue({ ...VALID, attachments: [] });
    await enqueue({ ...VALID, email: "druga@test.pl", attachments: [] });

    // Świeży przebieg, tak jak po starcie procesu — nic nie trzymamy w pamięci.
    const stats = await processDue();

    expect(stats.sent).toBe(2);
    expect(await fs.readdir(__testing.pendingDir())).toEqual([]);
  });

  it("pomija uszkodzony katalog zamiast wywracać cały przebieg", async () => {
    await enqueue({ ...VALID, attachments: [] });
    await fs.mkdir(path.join(__testing.pendingDir(), "smiec-bez-job-json"));

    const stats = await processDue();

    expect(stats.sent).toBe(1); // poprawne zgłoszenie mimo to poszło
  });
});
