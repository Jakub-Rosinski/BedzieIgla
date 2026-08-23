# CLAUDE.md — Będzie Igła

## Project Overview

Portfolio website for Gosia Wiśniewska Tattoo studio. Single-page scroll-based application with a luxury aesthetic, animated circular navigation menu, client-side S3 gallery, contact form with bot protection and rate limiting, and an interactive map with geolocation routing.

Hybrid architecture on an OVH VPS: the page itself is still fully prerendered (`@sveltejs/adapter-node`, `prerender = true`), served as static HTML by Nginx/the Node process exactly like before — but a real Node.js process now also runs (via PM2, behind Nginx) to serve one dynamic endpoint, `/api/contact`, which sends the contact form by SMTP with full-quality photo attachments (see `src/routes/api/contact/+server.js`). This replaced the previous fully-static `@sveltejs/adapter-static` + EmailJS setup, whose ~50KB EmailJS template-variable limit forced brutal client-side photo compression (400px/quality 0.4) — see GitHub issue #10.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | SvelteKit v2 + Svelte v5 |
| Language | TypeScript v5 (strict mode), JSDoc annotations in `.js` files |
| Build tool | Vite v6 |
| Package manager | pnpm v9 |
| Adapter | `@sveltejs/adapter-node` (hybrid: page prerendered, `/api/contact` dynamic) |
| Contact form | Server-side `/api/contact` endpoint → nodemailer over SMTP, real MIME attachments |
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
    components/         # Eight self-contained components (sections + UI)
    form-utils.js       # Validation (6 fields) — reused server-side by api/contact
    s3-utils.js         # XML parser for S3 ListObjectsV2 responses
    server/             # Server-only (SvelteKit build-guards client imports)
      mailer.js         # nodemailer/SMTP send, real MIME attachments
      rate-limit.js     # In-memory per-IP sliding window: attempts + sends
      image-utils.js    # Magic-byte image sniffing + attachment name sanitising
      queue.js          # Durable on-disk submission queue + retry worker
    hooks.server.js     # Starts the queue worker at server boot (guarded by `building`)
    index.js            # Barrel re-exports
  routes/
    +layout.js          # export const prerender = true
    +layout.svelte      # Root layout — imports global CSS, renders Cursor, injects GA4
    +page.js            # load() returns social media URLs
    +page.svelte        # Home page — composes sections, canonical link, JSON-LD
    api/contact/
      +server.js        # POST — validates, rate-limits, sends contact email
static/
  logo.png              # Site logo / OG image
  favicon.png
  gosia-photo.jpg       # Portrait for the "O mnie" section (800x902, optimised)
  robots.txt            # Allows all crawlers, points to sitemap
  sitemap.xml           # Single-URL sitemap — update lastmod on content changes
  .htaccess             # OBSOLETE — superseded by deploy/nginx.conf.template, kept until VPS cutover confirmed
deploy/
  setup-vps.sh          # One-time OVH VPS provisioning script (Nginx, PM2, Node, ufw, certbot)
  ecosystem.config.js   # PM2 process file (fork mode, single instance — see rate-limit.js note)
  nginx.conf.template   # Reverse proxy: TLS, security headers, gzip, static asset caching
  .env.example           # VPS-only secrets template (SMTP_*, CONTACT_TO_EMAIL) — never committed with real values
.env                    # VITE_* + SMTP_* env vars (never commit — see .env.example)
.env.example            # Template for all required env vars
```

### Components at a glance

| File | Responsibility |
|------|---------------|
| `Cursor.svelte` | Custom cursor (dot + ring) with RAF easing |
| `CircularMenu.svelte` | Rotating wheel navigation — SVG, particles, orbit rings. Label font size: 18px |
| `Hero.svelte` | Full-screen hero with pulsing glow orb |
| `OmniSection.svelte` | "O mnie" — Gosia's portrait photo + bio (4 paragraphs), portrait aligned to top, shown on mobile too |
| `GaleriaSection.svelte` | Two-row infinite carousel (JS RAF loop), per-row drag + inertia, lightbox with focus trap |
| `KontaktSection.svelte` | 7-field contact form + social links + embedded MapaSection — posts to `/api/contact` |
| `MapaSection.svelte` | Leaflet map + browser geolocation + OSRM routing |
| `ScrollTopButton.svelte` | Floating "back to top" button — appears past 100vh, orbital dashed ring, smaller/dimmed on desktop |

## Build & Test Commands

```bash
pnpm dev          # Dev server at http://localhost:5173
pnpm build        # Node build (adapter-node) → build/ (index.js + client/ + server/ + prerendered/)
pnpm start        # Run the built server: node -r dotenv/config build/index.js
pnpm preview      # Preview production build locally
pnpm check        # svelte-kit sync + svelte-check (type checking)
pnpm check:watch  # Type checking in watch mode
pnpm test         # Unit tests (Vitest) — 125 tests across 8 files
pnpm test:e2e     # End-to-end tests (Playwright)
```

Required environment variables (see `.env.example`):

```
# Build-time, client-exposed (VITE_*) — baked into the client bundle by Vite/GitHub Actions
VITE_GA4_ID            # Google Analytics 4 Measurement ID (optional — leave empty to disable)
VITE_S3_LIST_URL       # S3 bucket URL for ListObjectsV2 (empty = use picsum test photos)
VITE_S3_PUBLIC_URL     # S3 base URL for public object access (no trailing slash)
VITE_S3_PREFIX         # Folder prefix, e.g. gallery/ (default: gallery/)

# Runtime, server-only — NEVER VITE_-prefixed, NEVER set in CI. Set only on the VPS
# (deploy/.env.example), read via process.env at request time.
SMTP_HOST               # ssl0.ovh.net — MUST be OVH, see SPF note below
SMTP_PORT               # e.g. 465
SMTP_USER               # kontakt@bedzieigla.pl — a real OVH MX Plan mailbox (verified: 5 GB,
                        # not an alias). Doubles as the From address, see SPF note below.
SMTP_PASS               # Password of that mailbox, set/reset in the OVH MX Plan panel
CONTACT_TO_EMAIL        # Inbox that receives contact-form submissions (Gosia's Gmail)
QUEUE_DIR               # Submission queue dir (default: queue) — MUST be outside build/
```

## Key Implementation Notes

- **Hybrid rendering**: `prerender = true` is set in `+layout.js` and still applies to the home page — adapter-node serves it from `build/prerendered/` like static HTML. The one exception is `src/routes/api/contact/+server.js`, which explicitly sets `prerender = false` and runs dynamically in the persistent Node process.
- **SSR safety**: Leaflet and leaflet-routing-machine are imported dynamically inside `onMount` (`MapaSection.svelte`).
- **Contact form**: Client (`KontaktSection.svelte`) posts a `multipart/form-data` `FormData` (real `File` objects) to same-origin `/api/contact`. Fields: name, email, phone, miejsce na ciele, wielkość, opis pomysłu, inspiracje (image attachments ≤5 MB/file, ≤18 MB combined, ≤6 files). Client-side resize is light (2200px longest side, JPEG quality 0.85, skipped entirely for already-small files). The endpoint validates, rate-limits and sniffs the images, then **enqueues** the submission (`src/lib/server/queue.js`) and returns `200` — the response confirms *acceptance, not delivery*. A background worker does the actual nodemailer/SMTP send with real MIME attachments. Validation (`validate()` in `form-utils.js`) is imported and reused as-is server-side.
- **Contact form — durability**: The endpoint used to `await sendContactEmail()` and return `502` on failure, which **destroyed the submission** — text, contact details and photos, silently. Now every submission is written to `QUEUE_DIR/pending/<id>/` (`job.json` + raw attachment files) *before* any send is attempted. Two filesystem guarantees carry the durability: the job is built in a `.staging-*` dir and moved in with a single `rename()` (so `pending/` never holds a half-written job), and `job.json` is rewritten via `.tmp` + `rename()` (so the attempt counter can't be corrupted). Retries back off 1min → 5min → 15min → 1h → 6h; after 6 attempts the job moves to `QUEUE_DIR/dead/` and logs a line starting `[kolejka] ALERT:` — that string is the hook for monitoring (issue #25). Delivery is **at-least-once**: a crash between SMTP accepting and the dir being removed re-sends. Deliberate — a duplicate in Gosia's inbox costs far less than a lost enquiry. The worker starts from `src/hooks.server.js`, guarded by `building` so `pnpm build` doesn't spawn it during prerender.
- **SMTP must be OVH, not Gmail**: the domain's SPF is `v=spf1 include:mx.ovh.com -all`. The trailing `-all` is a *hard* fail, so mail sent from Google's servers with `From: @bedzieigla.pl` is rejected outright. `mailer.js` derives `From` from `SMTP_USER` deliberately — keeping them aligned is what makes SPF/DKIM pass. `SMTP_USER` must be a real mailbox (a forwarding alias has no password and cannot authenticate).
- **Contact form — server-side defences** (client checks are UX fast-fail only; the server is authoritative):
  - *Two-tier rate limiting* (`rate-limit.js`): `recordAttempt` counts **every** request before the body is parsed (30 / 15 min / IP) so floods of large invalid multiparts are throttled; `checkRateLimit`/`recordSend` separately cap **actual sends** (5 / 15 min / IP). The attempt counter must stay generous so a user fumbling the form isn't locked out. Counting only successes (the original design) left invalid requests completely unthrottled.
  - *Attachment content is sniffed, not trusted* (`image-utils.js`): the declared `Content-Type` is ignored; the format is detected from magic bytes (JPEG/PNG/GIF/WebP) and anything else is rejected. The attachment filename is rebuilt server-side (path components stripped, whitelist of characters, extension forced to the detected format) because the client-supplied name lands directly in Gosia's inbox.
  - *Bot checks*: honeypot, plus fill-time via `isBotSubmission`. A **missing** `firstInteractionAt` field is treated as a bot (our form always sends it, so absence means the request didn't come from the form); a value of `0` is allowed, to avoid silently dropping real enquiries from autofill edge cases. Bot-detected requests get a silent `200`.
  - Nodemailer handles header-injection safely on its own (subject is RFC 2047-encoded, CRLF in filenames escaped) — verified, no extra escaping needed.
- **Gallery — JS carousel**: Items split into two rows, duplicated for seamless looping. Position driven by a single `requestAnimationFrame` loop — no CSS animations. Each row is independently draggable with inertia that blends into auto-scroll. Loop pauses via `IntersectionObserver` when off-screen; falls back to always-visible when `IntersectionObserver` unavailable (test env).
- **Gallery — lightbox**: Click opens full-size photo with Svelte `fade`/`scale` transitions. Focus trap: focus moves to close button on open, returns to trigger card on close, Tab kept inside. Close on Escape or click outside.
- **Gallery — S3 mode**: Calls `VITE_S3_LIST_URL?list-type=2&prefix=...`, parses XML via `parseS3Xml` in `s3-utils.js`, builds URLs from `VITE_S3_PUBLIC_URL`. Falls back to picsum.photos when `VITE_S3_LIST_URL` is empty.
- **SEO**: `app.html` has complete meta tags (description, keywords, OG, Twitter Card). `+page.svelte` has canonical link and JSON-LD `TattooParlor` structured data (address, GPS, phone, socials, Gosia's education). `static/sitemap.xml` and `static/robots.txt` present.
- **Analytics**: GA4 injected in `+layout.svelte` via `{@html}` in `<svelte:head>`. Only loads when `VITE_GA4_ID` is set — safe to leave empty in dev.
- **Security headers**: Set via Nginx (`deploy/nginx.conf.template`) — CSP (covers GA4, OSM, OSRM, OVH S3, Google Fonts; no longer needs api.emailjs.com since the form posts same-origin), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy, HTTPS redirect, static asset caching, gzip. They live in an `/etc/nginx/snippets/bedzieigla-security.conf` snippet that every `location` block `include`s — **Nginx does not inherit `add_header` into a location that declares its own**, so without the re-include, `/_app/*` assets would silently lose every security header. `static/.htaccess` is obsolete (Apache no longer in the request path) but left in place until the VPS cutover is confirmed live.
- **Nginx bootstrap order**: `nginx.conf.template` contains a TLS block, which Nginx refuses to load before certificates exist. Bring the site up on port 80 first, run `certbot --nginx`, then install the full template. See the note at the top of that file.
- **Deploy target**: OVH VPS-1 running Node via PM2 (fork mode, single instance — see `src/lib/server/rate-limit.js`'s comment on why cluster mode isn't safe here) behind Nginx. `.github/workflows/deploy.yml` rsyncs the build over SSH and reloads PM2, replacing the previous FTP-to-shared-hosting deploy.
- **Scroll-to-top button**: `ScrollTopButton.svelte`, rendered globally in `+layout.svelte`. Visibility toggled by a rAF-throttled passive `scroll` listener (`scrollY > innerHeight`), so it appears once the Hero leaves the viewport. `z-index: 8000` — above content, below the noise overlay (9000), custom cursor (9998/9999) and gallery lightbox (9999). Honours `prefers-reduced-motion` (no ring spin, instant scroll).
- **body `cursor: none`**: Default cursor globally hidden (`app.css`); `Cursor.svelte` provides a custom animated replacement. Cards and interactive elements use `cursor: none` to keep the custom cursor.

## Pending Before Launch

- Order the OVH VPS-1 and run `deploy/setup-vps.sh` on it (Nginx, PM2, Node, ufw, certbot)
- Point `bedzieigla.pl` DNS at the new VPS IP, then run `certbot --nginx` for the TLS cert
- Set/reset the password of the `kontakt@bedzieigla.pl` OVH mailbox and put the real `SMTP_*`/`CONTACT_TO_EMAIL` values in the VPS-local `.env` (`deploy/.env.example`) — never in git, never in CI. **Not** a Gmail App Password: authenticating on Google's SMTP with `From: @bedzieigla.pl` fails the domain's `-all` SPF outright
- Enable DKIM signing for `bedzieigla.pl` in the OVH MX Plan panel — the panel flags it red under Diagnostic and no selector is published in DNS (checked). Do this **before** adding the DMARC record, otherwise DMARC reports can't distinguish a forwarding hop from a real failure
- Add `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` GitHub Actions secrets for the SSH deploy job; old `FTP_*` secrets are now unused. **`VPS_USER` must be exactly `deploy`** — `ecosystem.config.js` (`cwd`) and `nginx.conf.template` (`root`) hardcode `/home/deploy/bedzieigla`
- Set all `VITE_*` env vars on the production server (build-time, via GitHub Actions secrets as before)
- Smoke-test the live form end-to-end: confirm a full-quality photo attachment actually lands at `CONTACT_TO_EMAIL`
- Update `<lastmod>` in `static/sitemap.xml` after each content deployment
