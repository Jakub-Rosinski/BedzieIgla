# Zadania dla Claude Code — bedzieigla.pl (zaktualizowane po audycie)

> Strona wizytówkowa studia tatuażu "Będzie Igła! — Gosia Wiśniewska Tattoo" w Gliwicach.
> **Stack (potwierdzony audytem):** SvelteKit v2 + Svelte v5 + `@sveltejs/adapter-static` (v3), TypeScript, Vite v6, pnpm. Hosting: OVH shared hosting (Apache), statyczny build. Jednostronicowa aplikacja scroll (sekcje jako kotwice `#hero`, `#o-mnie`, `#galeria`, `#kontakt` — **nie** osobne podstrony).

**Legenda statusów:** ✅ zrobione · ⚠️ częściowe / do poprawy · ❌ do zrobienia · 🔴 krytyczne

---

## 1. Diagnoza stacku i renderowania — ✅ WYKONANE

Wynik audytu:

| Element | Stan |
|---|---|
| Framework | SvelteKit v2 + Svelte v5 |
| Renderowanie | **SSG / prerendering** — `export const prerender = true` w `src/routes/+layout.js`, `adapter-static` |
| Hosting / deploy | OVH shared hosting, Apache, statyczny `build/` (pre-render + SPA fallback) |
| robots.txt | ✅ istnieje (`static/robots.txt`) — `Allow: /` + wskazanie sitemapy |
| sitemap.xml | ✅ istnieje (`static/sitemap.xml`) — 1 URL (poprawnie dla strony jednostronicowej) |

**Wniosek kluczowy:** projekt **jest** skonfigurowany do prerenderingu, ale przez błąd konfiguracji (patrz zadanie 2) prerenderowany HTML jest nadpisywany pustym shellem SPA. Diagnoza z pierwotnego briefu ("pusty `<body>` pod crawlerem") jest **prawdziwa**, ale przyczyna jest inna niż zakładano — to nie brak SSG, tylko jego zepsucie na etapie builda.

---

## 2. Naprawa renderowania pod SEO — 🔴 KRYTYCZNE, jedna linijka fixu

**Zdiagnozowana przyczyna (root cause):** w `svelte.config.js` ustawiono `fallback: "index.html"`. SvelteKit najpierw **prerenderuje** stronę `/` do `build/index.html` (pełna treść, ~21,7 kB), a następnie `adapter-static` **nadpisuje** ten plik pustym shellem SPA (~4,3 kB, tylko bootstrap JS). Build wypisuje wprost ostrzeżenie:

```
Overwriting build/index.html with fallback page. Consider using a different name for the fallback.
```

**Dowód (zweryfikowane w audycie):**
- `fallback: "index.html"` → `build/index.html` = **4,3 kB, 0× `<h1>`, brak JSON-LD, pusty `<div style="display:contents">`**
- `fallback: "200.html"` → `build/index.html` = **21,7 kB, JSON-LD obecny, "Gliwice" ×7, `rel=canonical` obecny** — pełna treść widoczna bez JS ✅

**Fix (do wdrożenia):**
1. W `svelte.config.js` zmień `fallback: "index.html"` → `fallback: "200.html"`.
2. W `static/.htaccess` (linia ~41) zmień regułę SPA-fallback `RewriteRule ^ /index.html [L]` → `RewriteRule ^ /200.html [L]`, żeby nieznane ścieżki trafiały do shella SPA, a `/` i crawlery dostawały prerenderowany `index.html`.
3. Weryfikacja: `pnpm build && grep -c "TattooShop\|Gliwice" build/index.html` — treść musi być obecna, a ostrzeżenie "Overwriting..." ma zniknąć.

> Alternatywa: całkowicie usunąć `fallback` (wszystkie trasy są prerenderowane, jest tylko `/`) — ale wariant z `200.html` jest bezpieczniejszy dla ewentualnej nawigacji klienckiej.

---

## 3. Dane strukturalne LocalBusiness (schema.org) — ✅ WYKONANE

`src/routes/+page.svelte`, JSON-LD w `<svelte:head>` przez `{@html}`, typ `TattooParlor` (poprawny typ schema.org — wcześniej był nieistniejący `TattooShop`, przez co walidator zgłaszał błąd na `aggregateRating`). Zawiera: `name`, `alternateName`, `description`, `url`, `telephone` (+48531269735), `image`, `address` (ul. Zawiszy Czarnego 22, Gliwice, Śląskie, PL), `geo`, `hasMap`, `employee`, `sameAs` (FB/IG/TikTok), `contactPoint`. Prerenderuje się poprawnie (zweryfikowane: parsuje się, `TattooShop` obecny w `build/index.html`).

**Dodane w tej iteracji (dane od właścicielki):**
- ✅ `priceRange: "150–1400 PLN"` + `currenciesAccepted: "PLN"`
- ✅ `openingHoursSpecification` — pon–pt 10:00–18:00 (sob/nd zamknięte, więc pominięte)
- ✅ `aggregateRating` — `ratingValue: "5.0"`, `reviewCount: "94"` (dane z wizytówki Google)

> ⚠️ **Uwaga o `aggregateRating`:** Google często **ignoruje** self-serving oceny w markупie LocalBusiness (bez recenzji renderowanych na stronie) i może pokazać ostrzeżenie w Rich Results Test. Znacznik jest poprawny, ale gwiazdki w wynikach nie są gwarantowane. Wartość trzeba aktualizować ręcznie przy zmianie liczby opinii — patrz notka o Google API poniżej.

> **Google Reviews API (opcjonalne, nie wdrożone):** liczbę i ocenę można pobierać z Google Places API (Place Details → `rating`, `user_ratings_total`), ale: (1) wymaga klucza API, który na statycznej stronie klienckiej byłby publiczny (da się ograniczyć po HTTP referrer, ale to nie sekret); (2) regulamin Google ogranicza cache'owanie/przechowywanie danych Places; (3) dane pobrane po stronie klienta i tak **nie trafią do prerenderowanego JSON-LD** (crawler ich nie zobaczy), więc dla SEO wartość zaszyta w HTML jest lepsza. Rekomendacja: zostawić wartość zaszytą i aktualizować ręcznie; ewentualne pobieranie z API tylko dla wizualnego „badge'a" opinii.

---

## 4. Treść widoczna dla crawlerów — ⚠️ CZĘŚCIOWO (najważniejszy brak: `<h1>`)

Po fixie z zadania 2 prerenderowany HTML zawiera już bio Gosi (~200 słów, sekcja "O mnie") i linki społecznościowe jako `<a href>`. **Braki wykryte audytem:**

- 🔴 **Brak `<h1>` na całej stronie.** Nagłówki w projekcie: `OmniSection` `<h2>Gosia</h2>` + `<h3>`, `GaleriaSection` `<h2>`, `KontaktSection` `<h2>`. Główny branding ("Będzie Igła!") jest renderowany jako **tekst w SVG w `CircularMenu.svelte`** — crawler nie odczyta go jako nagłówka. **Dodaj jeden `<h1>`** z frazą główną (np. "Studio tatuażu Będzie Igła! w Gliwicach — Gosia Wiśniewska"), np. w `Hero.svelte`; można wizualnie ukryć klasą `.visually-hidden` (bez zmiany designu), ale musi być w DOM/HTML.
- ⚠️ **Hierarchia nagłówków zaczyna się od `<h2>`** — po dodaniu `<h1>` będzie poprawna (h1 → h2 → h3).
- ⚠️ **Adres jako widoczny tekst — brak w prerenderowanym HTML.** `STUDIO_ADDRESS = "ul. Zawiszy Czarnego 22, Gliwice"` (`MapaSection.svelte`) jest wstrzykiwany tylko do popupu Leaflet **po stronie klienta** (`onMount`) → nie ma go w statycznym HTML (jest tylko w JSON-LD). Dodaj adres jako zwykły tekst w sekcji Kontakt (np. `<address>`).
- ✅ Frazy `tatuaż Gliwice` / `studio tatuażu Gliwice` / `tatuatorka Gliwice` są w `meta keywords`/`description`; warto wpleść naturalnie także w widoczny tekst sekcji "O mnie".
- ✅ Linki do Instagrama/Facebooka/TikToka jako `<a href>` (`KontaktSection`, wartości z `+page.js`).

---

## 5. robots.txt i sitemap.xml — ✅ WYKONANE (drobiazg)

- ✅ `static/robots.txt` — `User-agent: * / Allow: /` + `Sitemap: https://bedzieigla.pl/sitemap.xml`.
- ✅ `static/sitemap.xml` — 1 URL (`https://bedzieigla.pl/`), `lastmod 2026-04-30`, `priority 1.0`. **Poprawne** — to strona jednostronicowa, nie ma osobnych podstron cennik/o-mnie/kontakt (to kotwice na jednej stronie).
- ⚠️ Pamiętać o aktualizacji `<lastmod>` przy każdym wdrożeniu treści.

---

## 6. Spójność NAP (Name, Address, Phone) — ✅ SPÓJNE (jeden drobny wyjątek)

Audyt całego kodu — **brak rozbieżności**:
- **Telefon:** `531 269 735` / `+48531269735` — spójny w JSON-LD (×2), `KontaktSection` (label + `wa.me/48531269735`), placeholderach i testach.
- **Adres:** `ul. Zawiszy Czarnego 22, Gliwice` — spójny w JSON-LD i `MapaSection` (`STUDIO_ADDRESS`, tekst o parkingu). Geo: `50.2892389, 18.6506629`.
- **Nazwa:** `Będzie Igła!` — spójna wszędzie.
- ⚠️ Drobiazg (styk z zadaniem 8): pozycja "Tel. 531 269 735" w linkach kontaktowych ma `href="https://wa.me/48531269735"` (WhatsApp), **nie** `tel:`. Numer się zgadza, ale to link do WhatsAppa, nie klikalny telefon.

Do potwierdzenia przez właściciela przed ewentualną zmianą: czy adres i telefon są aktualne.

---

## 7. Wydajność i dostępność — ⚠️ kilka konkretów

Posortowane wg wpływu/łatwości:

1. 🔴 **`static/favicon.png` = 512 kB** (identyczny plik co `logo.png`). Favicon powinien mieć kilka kB — przeskaluj do 32–64 px / użyj `.ico`/małego PNG. Duży wpływ, trywialne.
2. ⚠️ **`static/logo.png` = 512 kB** — używany jako OG image i `image` w JSON-LD. Skompresować / rozważyć WebP (dla OG zostaw też PNG/JPG dla kompatybilności).
3. 🔴 **Brak `<h1>` + hierarchia od `<h2>`** (patrz zadanie 4) — istotne dla SEO i a11y.
4. ✅ **Portret Gosi — WYKONANE.** Placeholder `GW` zastąpiony realnym zdjęciem (`static/gosia-photo.jpg`, 800×902, 285 kB → 89 kB, EXIF wyczyszczony), z opisowym `alt`, `width`/`height`, `loading="lazy"`. Zdjęto `aria-hidden`, portret pokazywany także na mobile (wcześniej `display: none` poniżej 680 px).
5. ✅ **Obrazy galerii** — mają `alt={photo.alt}`, `width`/`height`, `loading="lazy"`, `decoding="async"`. Dobrze. (Ładowane klienta z S3/picsum — poza prerenderem, to OK.)
6. ⚠️ **Kontrast WCAG AA** — do sprawdzenia: czerwień `#d60905` i przygaszony tekst `--ink2` na ciemnym tle. Zweryfikować teksty pomocnicze/etykiety (mogą nie spełniać 4.5:1).
7. ℹ️ Brak nowoczesnych formatów (WebP/AVIF) dla logo/favicon — patrz pkt 1–2.

---

## 8. ~~Formularz kontaktowy / CTA~~ — ❌ USUNIĘTE (decyzja klienta)

Klient nie życzy sobie systemów rezerwacji typu Booksy/Fresha — zadanie zdjęte z listy.
Stan zastany i tak jest wystarczający: działający formularz EmailJS (`KontaktSection.svelte`),
linki do IG/FB/TikTok, a w tej iteracji dodano klikalny `tel:+48531269735` (patrz zadanie 4).
`mailto:` pozostaje opcjonalne — kontakt mailowy realizuje formularz.

---

## Zaktualizowana kolejność wykonania

1. ~~**Zadanie 2** (fix `fallback` → `200.html` + `.htaccess`)~~ — ✅ zrobione.
2. ~~**Zadanie 4** (`<h1>` + adres jako tekst + `tel:`)~~ — ✅ zrobione.
3. ~~**Zadanie 3** (`openingHours`/`priceRange`/`aggregateRating`)~~ — ✅ zrobione.
4. ~~**Zadanie 7 pkt 1–2** (odchudzić favicon/logo)~~ — ✅ zrobione.
5. **Zadanie 7 pkt 4, 6** (realne zdjęcie Gosi — ⏳ czeka na zdjęcie; kontrast WCAG do sprawdzenia).
6. **Zadanie 5** (przy deployu — aktualizacja `<lastmod>` w `sitemap.xml`).

## Uwaga
Wszystkie zmiany wykonane lokalnie na branchu `new-features`. Pozostaje ręczna aktualizacja
`aggregateRating` przy zmianie liczby opinii Google oraz podmiana portretu Gosi, gdy zdjęcie będzie dostępne.
