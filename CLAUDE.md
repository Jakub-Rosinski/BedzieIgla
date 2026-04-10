# CLAUDE.md — Będzie Igła

## Project Overview

Portfolio website for Gosia Wiśniewska Tattoo studio. Single-page scroll-based application with a luxury aesthetic, animated circular navigation menu, client-side S3 gallery, contact form with bot protection and localStorage rate limiting, and an interactive map with geolocation routing.

Deployed on OVH shared hosting (Apache) as a fully pre-rendered static site via `@sveltejs/adapter-static`. No Node.js server process runs — all logic executes in the browser.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | SvelteKit v2 + Svelte v5 |
| Language | TypeScript v5 (strict mode), JSDoc annotations in `.js` files |
| Build tool | Vite v6 |
| Package manager | pnpm v9 |
| Adapter | `@sveltejs/adapter-static` (pre-rendered SPA, `fallback: index.html`) |
| Contact form | EmailJS API (client-side POST, no backend required) |
| Object storage | OVH S3-compatible bucket — public read, fetched directly from browser |
| Maps | Leaflet v1.9 + leaflet-routing-machine (OSRM, no API key) |
| Fonts | Playfair Display (display), Cormorant Garamond (body) — Google Fonts |
| Analytics | Google Analytics 4 (optional — loads only when `VITE_GA4_ID` is set) |
| Type checking | svelte-check |

## Key Directories

```
src/
  app.html              # HTML shell — meta, OG tags, Twitter Card, Google Fonts
  app.css               # Global styles + CSS custom properties (design tokens)
  ambient.d.ts          # Module declaration for leaflet-routing-machine
  lib/
    components/         # Seven self-contained section components
    form-utils.js       # Validation (6 fields) + client-side rate limiting
    s3-utils.js         # XML parser for S3 ListObjectsV2 responses
    index.js            # Barrel re-exports
  routes/
    +layout.js          # export const prerender = true
    +layout.svelte      # Root layout — imports global CSS, renders Cursor, injects GA4
    +page.js            # load() returns social media URLs
    +page.svelte        # Home page — composes sections, canonical link, JSON-LD
static/
  logo.png              # Site logo / OG image
  favicon.png
  robots.txt            # Allows all crawlers, points to sitemap
  sitemap.xml           # Single-URL sitemap — update lastmod on content changes
  .htaccess             # Security headers (CSP, HSTS, etc.), HTTPS redirect, caching, gzip
.env                    # VITE_* env vars (never commit — see .env.example)
.env.example            # Template for all required env vars
```

### Components at a glance

| File | Responsibility |
|------|---------------|
| `Cursor.svelte` | Custom cursor (dot + ring) with RAF easing |
| `CircularMenu.svelte` | Rotating wheel navigation — SVG, particles, orbit rings. Label font size: 18px |
| `Hero.svelte` | Full-screen hero with pulsing glow orb |
| `OmniSection.svelte` | "O mnie" — portrait placeholder + Gosia's bio (4 paragraphs), portrait aligned to top |
| `GaleriaSection.svelte` | Two-row infinite carousel (JS RAF loop), per-row drag + inertia, lightbox with focus trap |
| `KontaktSection.svelte` | 7-field contact form + social links + embedded MapaSection |
| `MapaSection.svelte` | Leaflet map + browser geolocation + OSRM routing |

## Build & Test Commands

```bash
pnpm dev          # Dev server at http://localhost:5173
pnpm build        # Static production build → build/
pnpm preview      # Preview production build locally
pnpm check        # svelte-kit sync + svelte-check (type checking)
pnpm check:watch  # Type checking in watch mode
pnpm test         # Unit tests (Vitest) — 69 tests across 3 files
pnpm test:e2e     # End-to-end tests (Playwright)
```

Required environment variables (see `.env.example`):

```
VITE_GA4_ID            # Google Analytics 4 Measurement ID (optional — leave empty to disable)
VITE_EMAILJS_SERVICE_ID   # EmailJS service ID
VITE_EMAILJS_TEMPLATE_ID  # EmailJS template ID
VITE_EMAILJS_PUBLIC_KEY   # EmailJS public key
VITE_S3_LIST_URL       # S3 bucket URL for ListObjectsV2 (empty = use picsum test photos)
VITE_S3_PUBLIC_URL     # S3 base URL for public object access (no trailing slash)
VITE_S3_PREFIX         # Folder prefix, e.g. gallery/ (default: gallery/)
```

## Key Implementation Notes

- **Static site**: `prerender = true` is set in `+layout.js`. No server endpoints — all data fetching is client-side.
- **SSR safety**: Leaflet and leaflet-routing-machine are imported dynamically inside `onMount` (`MapaSection.svelte`).
- **Contact form**: Uses EmailJS API (POST to `https://api.emailjs.com/api/v1.0/email/send`). Fields: name, email, phone, miejsce na ciele, wielkość, opis pomysłu, inspiracje (image attachments ≤5 MB each). All fields required except attachments. Bot protection: honeypot + fill-time check. Rate limiting: localStorage (3 sends / 15 min per email) + sessionStorage (5 sends per session). Validation in `form-utils.js` covers all 6 required fields.
- **Gallery — JS carousel**: Items split into two rows, duplicated for seamless looping. Position driven by a single `requestAnimationFrame` loop — no CSS animations. Each row is independently draggable with inertia that blends into auto-scroll. Loop pauses via `IntersectionObserver` when off-screen; falls back to always-visible when `IntersectionObserver` unavailable (test env).
- **Gallery — lightbox**: Click opens full-size photo with Svelte `fade`/`scale` transitions. Focus trap: focus moves to close button on open, returns to trigger card on close, Tab kept inside. Close on Escape or click outside.
- **Gallery — S3 mode**: Calls `VITE_S3_LIST_URL?list-type=2&prefix=...`, parses XML via `parseS3Xml` in `s3-utils.js`, builds URLs from `VITE_S3_PUBLIC_URL`. Falls back to picsum.photos when `VITE_S3_LIST_URL` is empty.
- **SEO**: `app.html` has complete meta tags (description, keywords, OG, Twitter Card). `+page.svelte` has canonical link and JSON-LD `TattooShop` structured data (address, GPS, phone, socials, Gosia's education). `static/sitemap.xml` and `static/robots.txt` present.
- **Analytics**: GA4 injected in `+layout.svelte` via `{@html}` in `<svelte:head>`. Only loads when `VITE_GA4_ID` is set — safe to leave empty in dev.
- **Security headers**: Set via `static/.htaccess` — CSP (covers EmailJS, GA4, OSM, OSRM, OVH S3, Google Fonts), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy, HTTPS redirect, static asset caching, gzip.
- **body `cursor: none`**: Default cursor globally hidden (`app.css`); `Cursor.svelte` provides a custom animated replacement. Cards and interactive elements use `cursor: none` to keep the custom cursor.

## Pending Before Launch

- Replace `GW` portrait placeholder in `OmniSection.svelte` with real photo (`/gosia-photo.jpg`)
- Set all `VITE_*` env vars on the production server
- Update `<lastmod>` in `static/sitemap.xml` after each content deployment
