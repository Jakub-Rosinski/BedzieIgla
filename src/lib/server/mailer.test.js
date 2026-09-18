import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMailMock = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}));

import nodemailer from "nodemailer";
import { sendContactEmail } from "./mailer.js";

const PARAMS = {
  name: "Anna Kowalska",
  email: "anna@test.pl",
  phone: "531 269 735",
  miejsce: "przedramię",
  wielkosc: "małe",
  message: "Chciałabym umówić się na konsultację.",
  attachments: [],
};

beforeEach(() => {
  sendMailMock.mockReset();
  sendMailMock.mockResolvedValue({});
  vi.mocked(nodemailer.createTransport).mockClear();
  vi.stubEnv("SMTP_HOST", "ssl0.ovh.net");
  vi.stubEnv("SMTP_PORT", "465");
  vi.stubEnv("SMTP_USER", "kontakt@bedzieigla.pl");
  vi.stubEnv("SMTP_PASS", "tajne");
  vi.stubEnv("CONTACT_TO_EMAIL", "gosia@gmail.com");
});

afterEach(() => vi.unstubAllEnvs());

describe("sendContactEmail — adresowanie", () => {
  it("wysyła na skrzynkę z konfiguracji, nie na adres podany przez klienta", async () => {
    await sendContactEmail(PARAMS);
    const mail = sendMailMock.mock.calls[0][0];

    expect(mail.to).toBe("gosia@gmail.com");
    expect(mail.to).not.toBe(PARAMS.email); // endpoint nie może stać się otwartym przekaźnikiem
  });

  it("ustawia Reply-To na adres klienta, żeby odpowiedź szła prosto do niego", async () => {
    await sendContactEmail(PARAMS);
    expect(sendMailMock.mock.calls[0][0].replyTo).toBe(PARAMS.email);
  });

  // From MUSI pokrywać się z kontem uwierzytelniającym. SPF domeny kończy się
  // na "-all", więc rozjazd tych dwóch adresów oznacza odrzucenie wiadomości.
  it("nadaje z konta uwierzytelniającego (zgodność SPF/DKIM)", async () => {
    await sendContactEmail(PARAMS);
    expect(sendMailMock.mock.calls[0][0].from).toContain("kontakt@bedzieigla.pl");
  });

  it("umieszcza dane kontaktowe w treści", async () => {
    await sendContactEmail(PARAMS);
    const { text, subject } = sendMailMock.mock.calls[0][0];

    expect(subject).toContain(PARAMS.name);
    expect(text).toContain(PARAMS.email);
    expect(text).toContain(PARAMS.phone);
    expect(text).toContain(PARAMS.message);
  });
});

describe("sendContactEmail — transport", () => {
  it("używa trybu secure dla portu 465", async () => {
    await sendContactEmail(PARAMS);
    expect(vi.mocked(nodemailer.createTransport).mock.calls[0][0]).toMatchObject({
      host: "ssl0.ovh.net",
      port: 465,
      secure: true,
    });
  });

  it("nie używa trybu secure dla portu 587 (STARTTLS)", async () => {
    vi.stubEnv("SMTP_PORT", "587");
    await sendContactEmail(PARAMS);
    expect(vi.mocked(nodemailer.createTransport).mock.calls[0][0]).toMatchObject({
      port: 587,
      secure: false,
    });
  });

  it("przekazuje załączniki bez zmian", async () => {
    const content = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    await sendContactEmail({
      ...PARAMS,
      attachments: [{ filename: "a.jpg", content, contentType: "image/jpeg" }],
    });

    const sent = sendMailMock.mock.calls[0][0].attachments[0];
    expect(sent.filename).toBe("a.jpg");
    expect(Buffer.compare(sent.content, content)).toBe(0);
  });
});

describe("sendContactEmail — brak konfiguracji", () => {
  it("rzuca błąd, gdy brakuje zmiennych SMTP — zamiast po cichu nie wysłać", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(sendContactEmail(PARAMS)).rejects.toThrow(/SMTP nie jest skonfigurowane/);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("rzuca błąd, gdy brakuje adresu docelowego", async () => {
    vi.stubEnv("CONTACT_TO_EMAIL", "");
    await expect(sendContactEmail(PARAMS)).rejects.toThrow();
  });
});
