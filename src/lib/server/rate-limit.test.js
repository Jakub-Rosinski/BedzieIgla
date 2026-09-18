import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, recordSend, recordAttempt, __testing } from "./rate-limit.js";

beforeEach(() => {
  __testing.sends.clear();
  __testing.attempts.clear();
});

describe("checkRateLimit / recordSend (limit realnych wysyłek)", () => {
  it("zezwala gdy brak historii dla IP", () => {
    expect(checkRateLimit("1.2.3.4").allowed).toBe(true);
  });

  it("zezwala poniżej MAX_SENDS_PER_IP", () => {
    const ip = "1.1.1.1";
    for (let i = 0; i < __testing.MAX_SENDS_PER_IP - 1; i++) recordSend(ip);
    expect(checkRateLimit(ip).allowed).toBe(true);
  });

  it("blokuje po osiągnięciu MAX_SENDS_PER_IP w oknie czasowym", () => {
    const ip = "2.2.2.2";
    for (let i = 0; i < __testing.MAX_SENDS_PER_IP; i++) recordSend(ip);
    expect(checkRateLimit(ip).allowed).toBe(false);
  });

  it("ignoruje wpisy spoza okna czasowego", () => {
    const ip = "3.3.3.3";
    const expired = Date.now() - __testing.WINDOW_MS - 1000;
    for (let i = 0; i < __testing.MAX_SENDS_PER_IP; i++) recordSend(ip, expired);
    expect(checkRateLimit(ip).allowed).toBe(true);
  });

  it("izoluje limity per IP", () => {
    const ipA = "4.4.4.4";
    const ipB = "5.5.5.5";
    for (let i = 0; i < __testing.MAX_SENDS_PER_IP; i++) recordSend(ipA);
    expect(checkRateLimit(ipA).allowed).toBe(false);
    expect(checkRateLimit(ipB).allowed).toBe(true);
  });
});

describe("recordAttempt (limit wszystkich żądań — ochrona przed floodem)", () => {
  it("zezwala poniżej MAX_ATTEMPTS_PER_IP", () => {
    const ip = "6.1.1.1";
    for (let i = 0; i < __testing.MAX_ATTEMPTS_PER_IP; i++) {
      expect(recordAttempt(ip).allowed).toBe(true);
    }
  });

  it("blokuje po przekroczeniu MAX_ATTEMPTS_PER_IP", () => {
    const ip = "6.2.2.2";
    for (let i = 0; i < __testing.MAX_ATTEMPTS_PER_IP; i++) recordAttempt(ip);
    expect(recordAttempt(ip).allowed).toBe(false);
  });

  it("jest liczony niezależnie od limitu wysyłek", () => {
    const ip = "6.3.3.3";
    for (let i = 0; i < __testing.MAX_ATTEMPTS_PER_IP; i++) recordAttempt(ip);
    // wyczerpane próby, ale żadnej realnej wysyłki nie było
    expect(recordAttempt(ip).allowed).toBe(false);
    expect(checkRateLimit(ip).allowed).toBe(true);
  });

  it("ignoruje próby spoza okna czasowego", () => {
    const ip = "6.4.4.4";
    const expired = Date.now() - __testing.WINDOW_MS - 1000;
    for (let i = 0; i < __testing.MAX_ATTEMPTS_PER_IP; i++) recordAttempt(ip, expired);
    expect(recordAttempt(ip).allowed).toBe(true);
  });
});

describe("cleanup", () => {
  it("usuwa wpisy IP bez świeżych timestampów w obu licznikach", () => {
    const ip = "7.7.7.7";
    const expired = Date.now() - __testing.WINDOW_MS - 1000;
    recordSend(ip, expired);
    recordAttempt(ip, expired);
    expect(__testing.sends.has(ip)).toBe(true);
    expect(__testing.attempts.has(ip)).toBe(true);

    __testing.cleanup();
    expect(__testing.sends.has(ip)).toBe(false);
    expect(__testing.attempts.has(ip)).toBe(false);
  });

  it("zachowuje wpisy ze świeżymi timestampami", () => {
    const ip = "8.8.8.8";
    recordSend(ip);
    recordAttempt(ip);
    __testing.cleanup();
    expect(__testing.sends.has(ip)).toBe(true);
    expect(__testing.attempts.has(ip)).toBe(true);
  });
});
