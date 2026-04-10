# Będzie Igła! — Gosia Wiśniewska Tattoo

Strona portfolio studia tatuażu **Będzie Igła!** Gosii Wiśniewskiej.

Jednostronicowa aplikacja SvelteKit z luksusową ciemną estetyką, animowanym kołem nawigacyjnym SVG, klientską galerią z OVH S3, formularzem kontaktowym z ochroną przed botami oraz interaktywną mapą z routingiem geolokalizacyjnym.

Wdrożona na **OVH hosting** jako w pełni prerenderowana strona statyczna (brak Node.js po stronie serwera).

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Framework | SvelteKit v2 + Svelte v5 |
| Język | TypeScript v5 (strict), anotacje JSDoc w plikach `.js` |
| Build | Vite v6 |
| Adapter | `@sveltejs/adapter-static` — SPA z `fallback: index.html` |
| Formularz | [Web3Forms](https://web3forms.com) API (brak backendu) |
| Galeria | Publiczny bucket OVH S3 — pobierany bezpośrednio z przeglądarki |
| Mapa | Leaflet v1.9 + leaflet-routing-machine (OSRM, bez klucza API) |
| Czcionki | Playfair Display + Cormorant Garamond (Google Fonts) |
| Testy | Vitest (unit) + Playwright (E2E) |
| CI/CD | GitHub Actions → deploy przez FTP na OVH |

---

## Uruchomienie lokalne

### Wymagania

- Node.js 22+
- pnpm 9.15+ (`npm install -g pnpm`)

### 1. Zainstaluj zależności

```bash
pnpm install
```

### 2. Utwórz plik `.env`

```bash
cp .env.example .env
```

| Zmienna | Wymagana | Opis |
|---------|----------|------|
| `VITE_WEB3FORMS_KEY` | Tak | Klucz dostępu Web3Forms (publiczny — bezpieczny w kliencie) |
| `VITE_S3_LIST_URL` | Nie | URL bucketa do `ListObjectsV2`. Pusty = galeria używa zdjęć testowych |
| `VITE_S3_PUBLIC_URL` | Nie | Bazowy URL do publicznych obiektów S3 (bez trailing slash) |
| `VITE_S3_PREFIX` | Nie | Prefix folderu zdjęć, np. `gallery/` (domyślnie: `gallery/`) |

Plik `.env` nie jest wymagany do startu — brak `VITE_S3_LIST_URL` włącza tryb testowy galerii (picsum.photos), brak `VITE_WEB3FORMS_KEY` powoduje błąd formularza.

### 3. Uruchom serwer deweloperski

```bash
pnpm dev
# → http://localhost:5173
```

### 4. Podgląd buildu produkcyjnego

```bash
pnpm build && pnpm preview
# → http://localhost:4173
```

---

## Komendy

| Komenda | Opis |
|---------|------|
| `pnpm dev` | Serwer deweloperski (hot reload) |
| `pnpm build` | Build produkcyjny → `build/` |
| `pnpm preview` | Lokalny podgląd buildu produkcyjnego |
| `pnpm check` | Sprawdzenie typów (svelte-check) |
| `pnpm check:watch` | Sprawdzanie typów w trybie watch |
| `pnpm test` | Testy jednostkowe (Vitest) |
| `pnpm test:e2e` | Testy E2E (Playwright + Chromium) |
| `pnpm test:all` | Unit + E2E |

---

## Konfiguracja przed deployem

### Formularz kontaktowy — Web3Forms

1. Zarejestruj się bezpłatnie na [web3forms.com](https://web3forms.com)
2. Utwórz Access Key i przypisz do docelowego adresu e-mail
3. Wklej klucz do zmiennej `VITE_WEB3FORMS_KEY` w `.env` oraz w sekretach GitHub (`Settings → Secrets → Actions`)

Bezpłatny plan obsługuje nieograniczoną liczbę wiadomości.

### Galeria — OVH S3

W trybie testowym (brak `VITE_S3_LIST_URL`) galeria wyświetla zdjęcia z picsum.photos. Aby użyć prawdziwego bucketa:

1. W panelu OVH (Public Cloud → Object Storage) ustaw politykę bucketa pozwalającą anonimowemu użytkownikowi na `s3:ListBucket`
2. Wgraj zdjęcia do folderu `gallery/` w buckecie (obsługiwane formaty: `jpg`, `jpeg`, `png`, `webp`, `gif`, `avif`)
3. Ustaw w `.env` i sekretach GitHub:

```
VITE_S3_LIST_URL=https://s3.waw.perf.cloud.ovh.net/bedzie-igla
VITE_S3_PUBLIC_URL=https://bedzie-igla.s3.waw.perf.cloud.ovh.net
```

---

## Deploy na OVH

Strona jest w pełni statyczna — nie wymaga Node.js na serwerze.

### Automatyczny (GitHub Actions)

Każdy push do gałęzi `main` uruchamia pipeline:

```
Type check → Unit tests → E2E tests → Build → FTP deploy
```

Sekrety wymagane w repozytorium (`Settings → Secrets → Actions`):

```
FTP_HOST, FTP_USERNAME, FTP_PASSWORD, FTP_SERVER_DIR
VITE_WEB3FORMS_KEY
VITE_S3_LIST_URL, VITE_S3_PUBLIC_URL, VITE_S3_PREFIX
```

### Ręczny

```bash
pnpm build
# Wgraj zawartość build/ do katalogu www/ na serwerze OVH (FTP lub rsync)
```

Plik `static/.htaccess` jest kopiowany automatycznie do `build/` — obsługuje:
- Przekierowanie HTTP → HTTPS
- SPA fallback (nieznane ścieżki → `index.html`)
- Nagłówki bezpieczeństwa (X-Frame-Options, HSTS, CSP-basic, Referrer-Policy)
- Cache dla assetów statycznych
- Kompresja gzip

---

## Struktura projektu

```
src/
├── app.html                      # HTML shell (meta, OG tags, Google Fonts)
├── app.css                       # Globalne style + CSS custom properties
├── ambient.d.ts                  # Deklaracja typów dla leaflet-routing-machine
├── lib/
│   ├── components/
│   │   ├── CircularMenu.svelte   # Animowane koło nawigacyjne (SVG)
│   │   ├── Cursor.svelte         # Własny kursor (dot + ring, RAF easing)
│   │   ├── GaleriaSection.svelte # Nieskończona karuzela zdjęć (S3 / picsum)
│   │   ├── Hero.svelte           # Sekcja hero (100vh)
│   │   ├── KontaktSection.svelte # Formularz Web3Forms + linki social + mapa
│   │   ├── MapaSection.svelte    # Leaflet + geolokalizacja + routing OSRM
│   │   └── OmniSection.svelte    # Sekcja "O mnie"
│   ├── form-utils.js             # Walidacja + client-side rate limiting
│   ├── s3-utils.js               # Parser XML S3 ListObjectsV2
│   └── index.js                  # Barrel re-exports
└── routes/
    ├── +layout.js                # export const prerender = true
    ├── +layout.svelte            # Root layout (globalny CSS, kursor)
    ├── +page.js                  # load() — URL-e social mediów
    └── +page.svelte              # Strona główna

static/
├── .htaccess                     # Apache: bezpieczeństwo, HTTPS, SPA, cache
├── favicon.png
└── logo.png
```

---

## Funkcjonalności

### Koło nawigacyjne

Animowany SVG z trzema sekcjami (O mnie, Galeria, Kontakt). Tekst biegnie wzdłuż łuków (`textPath`). Kliknięcie wywołuje animację implozji, po której następuje płynne przewinięcie do sekcji.

### Galeria

Dwurzędowa nieskończona karuzela. Zdjęcia pobierane z publicznego bucketa S3 (XML ListObjectsV2 → lista URL-i). Rzędy zatrzymują się po najechaniu; pozostałe karty ściemnieją przy hover na pojedynczej.

### Formularz kontaktowy

Wielowarstwowa ochrona przed botami:
- **Honeypot** — ukryty checkbox, boty go zaznaczają
- **Czas wypełniania** — zgłoszenia szybsze niż 3 sekundy są cicho odrzucane
- **Rate limit per email** — max 3 wysyłki w ciągu 15 minut (localStorage)
- **Rate limit sesji** — max 5 wysyłek na sesję (sessionStorage)

Dostęp do storage jest zabezpieczony `try/catch` — działa poprawnie w trybie prywatnym Safari i przy zablokowanych cookies.

### Mapa

Leaflet z ciemnymi kafelkami CartoDB, wyśrodkowana na lokalizacji studia (ul. Zawiszy Czarnego 22, Gliwice). Przycisk "Wyznacz trasę" pobiera geolokalizację przeglądarki i oblicza trasę samochodową przez OSRM (bez klucza API).

---

## Licencja

Projekt prywatny — wszelkie prawa zastrzeżone. © Gosia Wiśniewska / Będzie Igła!
