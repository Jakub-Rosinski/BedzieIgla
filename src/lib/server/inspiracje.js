/**
 * Zdjęcia-inspiracje z formularza w prywatnym buckecie S3 (#19).
 *
 * Oryginały nie jadą już w mailu (limit 25 MB Gmaila, base64 +33%) — trafiają
 * do OSOBNEGO bucketu bez publicznego odczytu. Bucket galerii odpada: ma ACL
 * `AllUsers:READ` na poziomie bucketu, czyli publiczne listowanie — każdy klucz,
 * także w „prywatnym" prefiksie, byłby widoczny. Bucket ma regułę lifecycle:
 * obiekty znikają po 90 dniach (RODO — zdjęcia ciała klientów).
 *
 * Mail dostaje miniatury jako załączniki (zostają na zawsze) i linki do
 * oryginałów. Link prowadzi do NASZEGO endpointu (`/api/inspiracje/...`) z
 * podpisem HMAC, a ten przekierowuje na świeży presigned URL — dzięki temu
 * link w mailu działa tak długo, jak istnieje obiekt, a nie tylko 7 dni
 * (twardy limit presigned URL w SigV4).
 *
 * Sekrety (INSPIRACJE_S3_*, LINK_SECRET) tylko na VPS, czytane w runtime.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import sharp from "sharp";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Ważność presigned URL wydawanego przy kliknięciu — tylko na czas pobrania. */
const PRESIGN_TTL_S = 300;

/** Dłuższy bok miniatury w mailu. */
const THUMB_PX = 800;

/** @param {string} name */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Brak zmiennej środowiskowej ${name} (patrz deploy/.env.example).`);
  return value;
}

/** @type {S3Client | null} */
let client = null;

function s3() {
  client ??= new S3Client({
    endpoint: requireEnv("INSPIRACJE_S3_ENDPOINT"),
    region: requireEnv("INSPIRACJE_S3_REGION"),
    credentials: {
      accessKeyId: requireEnv("INSPIRACJE_S3_ACCESS_KEY"),
      secretAccessKey: requireEnv("INSPIRACJE_S3_SECRET_KEY"),
    },
    // OVH nie obsługuje domyślnych od SDK 3.729 sum kontrolnych CRC32 we
    // wszystkich operacjach — liczymy je tylko tam, gdzie S3 ich wymaga.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

const bucket = () => requireEnv("INSPIRACJE_S3_BUCKET");

/**
 * Wgrywa oryginał z dysku kolejki. Klucz jest deterministyczny (id zgłoszenia),
 * więc ponowienie po awarii nadpisuje ten sam obiekt zamiast tworzyć duplikat.
 *
 * @param {string} key @param {string} file @param {string} contentType
 */
export async function uploadOriginal(key, file, contentType) {
  const { size } = await fs.promises.stat(file);
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: fs.createReadStream(file),
      ContentLength: size,
      ContentType: contentType,
    })
  );
}

/**
 * Miniatura JPEG do maila. `rotate()` stosuje orientację z EXIF (zdjęcia z
 * telefonu), a sharp domyślnie wycina metadane — także GPS — z wyniku.
 *
 * @param {string} file
 * @returns {Promise<Buffer>}
 */
export function thumbnail(file) {
  return sharp(file)
    .rotate()
    .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** @param {string} key */
function sign(key) {
  return crypto.createHmac("sha256", requireEnv("LINK_SECRET")).update(key).digest("base64url");
}

/**
 * Trwały link do oryginału dla maila.
 * @param {string} key
 */
export function inspirationLink(key) {
  const origin = requireEnv("ORIGIN");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${origin}/api/inspiracje/${path}?sig=${sign(key)}`;
}

/**
 * @param {string} key @param {string | null} sig
 */
export function verifyLink(key, sig) {
  if (!sig) return false;
  const expected = Buffer.from(sign(key));
  const given = Buffer.from(sig);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Presigned URL na kilka minut albo `null`, gdy obiektu już nie ma (lifecycle).
 * @param {string} key
 * @returns {Promise<string | null>}
 */
export async function presignedOriginal(key) {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (err) {
    if (/** @type {{ $metadata?: { httpStatusCode?: number } }} */ (err).$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: PRESIGN_TTL_S,
  });
}
