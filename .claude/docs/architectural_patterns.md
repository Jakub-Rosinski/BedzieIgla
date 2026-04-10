# Architectural Patterns

Patterns that appear across multiple files in this codebase. Read this before adding new components or API routes.

## 1. Section Composition

The home page (`src/routes/+page.svelte:1-17`) is a vertical stack of self-contained section components. Each section owns its own state, data fetching, and styles — no props or shared stores pass between them. New content areas should follow the same model: one component per logical section, imported and stacked in `+page.svelte`.

Global concerns (custom cursor, global CSS) belong in `src/routes/+layout.svelte`, not in individual sections.

## 2. Svelte Reactive State (no external store)

All state is local `let` variables. Svelte's compiler makes assignments reactive automatically — no stores, no Redux, no Context API.

Consistent shape across components:

- `Cursor.svelte:1-7` — mouse position coordinates
- `GaleriaSection.svelte:5-11` — `photos`, `loading`, `paused`
- `KontaktSection.svelte:4-10` — form fields + `status` + `errorMsg`
- `CircularMenu.svelte:4-6` — `imploding`, `glowing`, `mounted` flags

Keep state flat and local unless a value truly needs to cross component boundaries.

## 3. Form State Machine

Contact form (`src/lib/components/KontaktSection.svelte:8,23-42`) tracks lifecycle as a string enum:

```
idle → sending → success
                → error
```

Any future form should follow the same four-state pattern. The UI binds to `status` to show/hide spinners, success messages, and error feedback. `errorMsg` is set only in the `error` state.

## 4. Lifecycle-driven Animation

Animations are initialised in `onMount`, never at module scope (SSR safety). Two sub-patterns:

**requestAnimationFrame loop** — used for continuous motion (cursor easing in `Cursor.svelte:10-29`). Store the RAF id and cancel it in `onDestroy` if the loop should stop.

**One-shot delayed entry** — `requestAnimationFrame` used to defer a CSS class toggle until after paint (`CircularMenu.svelte:53-58`), triggering a CSS transition. Preferred over `setTimeout(0)`.

CSS keyframes for sustained animations (gallery scroll `GaleriaSection.svelte:227-253`, hero glow orb, floating hint arrow) are defined in component `<style>` blocks, not in `app.css`.

## 5. API Route Structure

Both API routes (`src/routes/api/kontakt/+server.js`, `src/routes/api/galeria/+server.js`) follow the same layered order:

1. **Input validation** — check types and constraints, return `400`/`422` early
2. **Rate limiting / caching** — in-memory guard before touching external services
3. **External service call** — SMTP or S3
4. **Error response** — explicit status codes with JSON `{ error: string }`
5. **Success response** — `json(payload, { status: 200 })`

Security: user-supplied strings going into HTML email bodies are escaped via the `escapeHtml` helper (`src/routes/api/kontakt/+server.js:130-136`).

## 6. Client-side Data Fetching

Components that need server data fetch in `onMount` with try/catch/finally:

```
onMount → fetch("/api/...") → assign reactive variable → finally: loading = false
```

Pattern visible in `GaleriaSection.svelte:13-22`. The `loading` flag gates a skeleton/spinner in the template. Errors are caught silently (warn to console) so the rest of the page remains functional — matching the `galeria` API's own graceful degradation (returns `[]` on S3 error).

## 7. CSS Design Tokens

All colors, fonts, and base spacing are CSS custom properties defined in `src/app.css:1-23`:

```
--bg, --bg2       background layers
--ink, --ink2     text hierarchy
--red             brand accent
--pink            light accent
--font-display    Playfair Display
--font-body       Cormorant Garamond
```

Every component references `var(--red)`, `var(--ink2)`, etc. Do not hardcode color values in component `<style>` blocks.

## 8. Responsive Design

Breakpoints are defined per-component (not in a shared file) using `@media (max-width: ...)`. Common thresholds in the codebase: `540px`, `600px`, `620px`, `640px`, `520px`. Layouts stack vertically and scale down on mobile. There is no shared breakpoint token — match the nearest existing value in the component you are editing.

## 9. Dynamic Imports for SSR Safety

Any browser-only library (Leaflet, routing machine) is imported with `await import(...)` inside `onMount`, never at the top of the file. `onMount` never runs on the server, so this prevents SSR crashes. See `src/lib/components/MapaSection.svelte:47-48`.

The same pattern should be applied to any future library that relies on `window`, `document`, or the DOM.

## 10. Infinite Carousel

`GaleriaSection.svelte` duplicates the photos array before rendering to create a seamless loop: the CSS animation translates the strip left until it has moved exactly one copy width, then instantly resets. The animation is paused on hover (`animationPlayState: paused`) via a reactive binding to the `paused` state variable. Replicate this approach for any future looping content strip.
