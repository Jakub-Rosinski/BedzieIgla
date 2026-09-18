# Będzie Igła! — Gosia Wiśniewska Tattoo

Strona portfolio studia tatuażu **Będzie Igła!** Gosii Wiśniewskiej.

Jednostronicowa aplikacja SvelteKit z luksusową ciemną estetyką, animowanym kołem nawigacyjnym SVG, klientską galerią z OVH S3, formularzem kontaktowym z pełnowymiarowymi załącznikami zdjęć oraz interaktywną mapą z routingiem geolokalizacyjnym.

Wdrożona na **OVH VPS** jako hybryda: strona nadal jest w pełni prerenderowana i serwowana jak statyczny HTML (Nginx), ale za nim stoi prawdziwy proces Node.js (PM2), który obsługuje jeden dynamiczny endpoint — `/api/contact` — wysyłający formularz przez SMTP z załącznikami w pełnej jakości.

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Framework | SvelteKit v2 + Svelte v5 |
| Język | TypeScript v5 (strict), anotacje JSDoc w plikach `.js` |
| Build | Vite v6 |
| Adapter | `@sveltejs/adapter-node` — strona prerenderowana, `/api/contact` dynamiczny |
| Formularz | Serwerowy endpoint `/api/contact` → nodemailer po SMTP, prawdziwe załączniki MIME |
| Galeria | Publiczny bucket OVH S3 — pobierany bezpośrednio z przeglądarki |
| Mapa | Leaflet v1.9 + leaflet-routing-machine (OSRM, bez klucza API) |
| Czcionki | Playfair Display + Cormorant Garamond (Google Fonts) |
| Testy | Vitest (unit) + Playwright (E2E) |
| CI/CD | GitHub Actions → deploy przez SSH/rsync na OVH VPS (PM2 + Nginx) |

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
| `VITE_GA4_ID` | Nie | Google Analytics 4 Measurement ID. Puste = analytics wyłączone |
| `VITE_S3_LIST_URL` | Nie | URL bucketa do `ListObjectsV2`. Pusty = galeria używa zdjęć testowych |
| `VITE_S3_PUBLIC_URL` | Nie | Bazowy URL do publicznych obiektów S3 (bez trailing slash) |
| `VITE_S3_PREFIX` | Nie | Prefix folderu zdjęć, np. `gallery/` (domyślnie: `gallery/`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Tak (dla formularza) | Dane serwera SMTP OVH — patrz sekcja niżej |
| `CONTACT_TO_EMAIL` | Tak (dla formularza) | Skrzynka odbierająca zgłoszenia z formularza |
| `QUEUE_DIR` | Nie | Katalog kolejki zgłoszeń (domyślnie: `queue`) |

Plik `.env` nie jest wymagany do startu — brak `VITE_S3_LIST_URL` włącza tryb testowy galerii (picsum.photos). Bez `SMTP_*`/`CONTACT_TO_EMAIL` formularz kontaktowy przyjmie zgłoszenie do kolejki, ale nigdy go nie wyśle.

### 3. Uruchom serwer deweloperski

```bash
pnpm dev
# → http://localhost:5173
```

### 4. Podgląd buildu produkcyjnego

```bash
pnpm build && node -r dotenv/config build/index.js
# → http://localhost:3000 (patrz ecosystem.config.cjs dla realnych zmiennych PORT/HOST)
```

---

## Komendy

| Komenda | Opis |
|---------|------|
| `pnpm dev` | Serwer deweloperski (hot reload) |
| `pnpm build` | Build produkcyjny (adapter-node) → `build/` |
| `pnpm start` | Uruchamia zbudowany serwer: `node -r dotenv/config build/index.js` |
| `pnpm preview` | Lokalny podgląd buildu produkcyjnego |
| `pnpm check` | Sprawdzenie typów (svelte-check) |
| `pnpm check:watch` | Sprawdzanie typów w trybie watch |
| `pnpm test` | Testy jednostkowe (Vitest) |
| `pnpm test:e2e` | Testy E2E (Playwright + Chromium) |
| `pnpm test:all` | Unit + E2E |

---

## Konfiguracja przed deployem

### Formularz kontaktowy — SMTP (OVH)

SMTP musi być po stronie OVH, nie Gmaila — rekord SPF domeny to `v=spf1 include:mx.ovh.com -all`, a `-all` to twardy fail. `SMTP_USER` musi być prawdziwą skrzynką OVH MX Plan (nie aliasem przekierowującym — alias nie ma hasła i nie może się uwierzytelnić), bo `mailer.js` używa jej jako adresu `From`.

1. Ustaw/zresetuj hasło skrzynki `kontakt@bedzieigla.pl` w panelu OVH MX Plan
2. Na VPS ustaw `SMTP_*`/`CONTACT_TO_EMAIL` w `/home/deploy/bedzieigla/.env` (patrz `deploy/.env.example`) — **nigdy** w sekretach GitHub Actions, bo te trafiają do builda klienckiego

### Galeria — OVH S3

W trybie testowym (brak `VITE_S3_LIST_URL`) galeria wyświetla zdjęcia z picsum.photos. Aby użyć prawdziwego bucketa:

1. W panelu OVH (Public Cloud → Object Storage) ustaw politykę bucketa pozwalającą anonimowemu użytkownikowi na `s3:ListBucket`
2. Wgraj zdjęcia do folderu `gallery/` w buckecie (obsługiwane formaty: `jpg`, `jpeg`, `png`, `webp`, `gif`, `avif`)
3. Ustaw w `.env` i sekretach GitHub (build-time, `VITE_*`):

```
VITE_S3_LIST_URL=https://s3.waw.perf.cloud.ovh.net/bedzie-igla
VITE_S3_PUBLIC_URL=https://bedzie-igla.s3.waw.perf.cloud.ovh.net
```

---

## Deploy na OVH VPS

Strona jest hybrydowa: prerenderowany HTML serwowany przez Nginx, plus jeden proces Node.js (PM2) obsługujący `/api/contact`.

### Automatyczny (GitHub Actions)

Każdy push do gałęzi `main` uruchamia pipeline:

```
Type check → Unit tests → E2E tests → Build → Deploy (SSH → OVH VPS)
```

Deploy job rsyncuje `build/` + `package.json`/`pnpm-lock.yaml` na VPS, instaluje zależności produkcyjne i robi `pm2 reload`. Szczegóły w `.github/DEPLOY.md` i `deploy/setup-vps.sh`.

Sekrety wymagane w repozytorium (`Settings → Secrets → Actions`):

```
VPS_HOST, VPS_USER, VPS_SSH_KEY
VITE_GA4_ID (opcjonalny)
VITE_S3_LIST_URL, VITE_S3_PUBLIC_URL, VITE_S3_PREFIX
```

Sekrety `SMTP_*`/`CONTACT_TO_EMAIL` **nigdy** nie trafiają do GitHub Actions — żyją wyłącznie w niewersjonowanym `.env` na VPS.

### Pierwsze uruchomienie serwera

Jednorazowe kroki opisane w `deploy/setup-vps.sh` (prowizjonowanie: Nginx, PM2, Node, ufw, certbot, fail2ban) i `.github/DEPLOY.md` (sekrety, TLS, pierwszy deploy).

Bezpieczeństwo (nagłówki HTTP, HTTPS redirect, SPA/prerender routing, cache statyczne, gzip) obsługuje `deploy/nginx.conf.template` — Nginx, nie `.htaccess` (Apache nie jest już w ścieżce requestu).

---

## Struktura projektu

```
src/
├── app.html                      # HTML shell (meta, OG tags, Google Fonts)
├── app.css                       # Globalne style + CSS custom properties
├── ambient.d.ts                  # Deklaracja typów dla leaflet-routing-machine
├── hooks.server.js               # Start workera kolejki zgłoszeń przy starcie serwera
├── lib/
│   ├── components/
│   │   ├── CircularMenu.svelte   # Animowane koło nawigacyjne (SVG)
│   │   ├── Cursor.svelte         # Własny kursor (dot + ring, RAF easing)
│   │   ├── GaleriaSection.svelte # Karuzela zdjęć + lightbox (S3 / picsum)
│   │   ├── Hero.svelte           # Sekcja hero (100vh)
│   │   ├── KontaktSection.svelte # Formularz → /api/contact + linki social + mapa
│   │   ├── MapaSection.svelte    # Leaflet + geolokalizacja + routing OSRM
│   │   ├── OmniSection.svelte    # Sekcja "O mnie"
│   │   └── ScrollTopButton.svelte# Przycisk powrotu na górę strony
│   ├── server/                   # Kod serwerowy (SvelteKit blokuje import z klienta)
│   │   ├── mailer.js             # nodemailer/SMTP, prawdziwe załączniki MIME
│   │   ├── rate-limit.js         # Limit prób/wysyłek per IP (in-memory)
│   │   ├── image-utils.js        # Sniffing magic-byte + sanityzacja nazw plików
│   │   └── queue.js              # Trwała kolejka zgłoszeń na dysku + worker retry
│   ├── form-utils.js             # Walidacja (współdzielona klient/serwer)
│   ├── s3-utils.js               # Parser XML S3 ListObjectsV2
│   └── index.js                  # Barrel re-exports
└── routes/
    ├── +layout.js                # export const prerender = true
    ├── +layout.svelte            # Root layout (globalny CSS, kursor, GA4)
    ├── +page.js                  # load() — URL-e social mediów
    ├── +page.svelte               # Strona główna
    └── api/contact/+server.js    # POST — walidacja, rate limit, kolejkowanie zgłoszeń

deploy/
├── setup-vps.sh                  # Jednorazowe prowizjonowanie świeżego VPS-a
├── ecosystem.config.cjs          # Plik procesu PM2 (fork mode, single instance)
├── nginx.conf.template           # Reverse proxy: TLS, nagłówki, gzip, cache
└── .env.example                  # Szablon sekretów VPS-owych (SMTP_*, CONTACT_TO_EMAIL)

static/
├── favicon.png
├── logo.png
├── gosia-photo.jpg
├── robots.txt
└── sitemap.xml
```

---

## Funkcjonalności

### Koło nawigacyjne

Animowany SVG z trzema sekcjami (O mnie, Galeria, Kontakt). Tekst biegnie wzdłuż łuków (`textPath`). Kliknięcie wywołuje animację implozji, po której następuje płynne przewinięcie do sekcji.

### Galeria

Dwurzędowa nieskończona karuzela napędzana pojedynczą pętlą `requestAnimationFrame` (bez animacji CSS). Każdy rząd jest niezależnie przeciągalny z inercją. Zdjęcia pobierane z publicznego bucketa S3 (XML `ListObjectsV2` → lista URL-i) lub picsum.photos w trybie testowym. Kliknięcie otwiera lightbox z pułapką fokusu.

### Formularz kontaktowy

Klient wysyła `multipart/form-data` na `/api/contact`, który waliduje, sprawdza limity, sniffuje załączniki po magic bytes i **kolejkuje** zgłoszenie na dysku przed jakąkolwiek próbą wysyłki — odpowiedź `200` potwierdza *przyjęcie*, nie dostarczenie. Osobny worker w tle wykonuje faktyczną wysyłkę SMTP z prawdziwymi załącznikami MIME, z ponawianiem (1min → 5min → 15min → 1h → 6h) i alertem po 6 nieudanych próbach.

Wielowarstwowa ochrona przed botami:
- **Honeypot** — ukryty checkbox, boty go zaznaczają
- **Czas wypełniania** — zgłoszenia szybsze niż 3 sekundy są cicho odrzucane
- **Rate limit prób** — 30/15 min/IP, liczone przed parsowaniem body
- **Rate limit wysyłek** — 5/15 min/IP, liczone tylko dla realnych wysyłek

### Mapa

Leaflet z ciemnymi kafelkami CartoDB, wyśrodkowana na lokalizacji studia (ul. Zawiszy Czarnego 22, Gliwice). Przycisk "Wyznacz trasę" pobiera geolokalizację przeglądarki i oblicza trasę samochodową przez OSRM (bez klucza API).

---

## Licencja

Projekt prywatny — wszelkie prawa zastrzeżone. © Gosia Wiśniewska / Będzie Igła!
