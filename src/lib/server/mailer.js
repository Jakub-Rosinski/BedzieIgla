/**
 * Wysyłka e-maili z formularza kontaktowego przez SMTP (nodemailer).
 * Zmienne środowiskowe czytane z process.env w runtime (nie w build time),
 * więc sekrety SMTP nigdy nie trafiają do builda ani do CI — ustawiane
 * wyłącznie na VPS (patrz deploy/.env.example), wczytywane przez
 * `-r dotenv/config` (patrz package.json "start", deploy/ecosystem.config.js).
 * Import tylko z src/lib/server/ — SvelteKit blokuje import tego modułu
 * z kodu klienckiego na etapie builda.
 */

import nodemailer from "nodemailer";

/**
 * @typedef {{ filename: string, content: Buffer, contentType: string }} MailAttachment
 */

/**
 * @param {{
 *   name: string, email: string, phone: string,
 *   miejsce: string, wielkosc: string, message: string,
 *   attachments: MailAttachment[]
 * }} params
 */
export async function sendContactEmail({ name, email, phone, miejsce, wielkosc, message, attachments }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !CONTACT_TO_EMAIL) {
    throw new Error("SMTP nie jest skonfigurowane (brak SMTP_HOST/SMTP_USER/SMTP_PASS/CONTACT_TO_EMAIL).");
  }

  const port = Number(SMTP_PORT ?? 465);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: `"Formularz bedzieigla.pl" <${SMTP_USER}>`,
    to: CONTACT_TO_EMAIL,
    replyTo: email,
    subject: `Nowe zapytanie — ${name}`,
    text:
      `Imię i nazwisko: ${name}\n` +
      `E-mail: ${email}\n` +
      `Telefon: ${phone}\n` +
      `Miejsce na ciele: ${miejsce}\n` +
      `Wielkość: ${wielkosc}\n\n` +
      `${message}`,
    attachments,
  });
}
