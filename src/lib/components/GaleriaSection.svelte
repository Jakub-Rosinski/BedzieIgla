<script>
    import { onMount, tick } from "svelte";
    import { fade, scale } from "svelte/transition";
    import { quintOut, quintIn } from "svelte/easing";
    import { parseS3Xml } from "$lib/s3-utils.js";

    // ─── Konfiguracja OVH S3 ─────────────────────────────────────────────────
    const S3_LIST_URL   = import.meta.env.VITE_S3_LIST_URL   ?? "";
    const S3_PUBLIC_URL = import.meta.env.VITE_S3_PUBLIC_URL ?? "";
    const S3_PREFIX     = import.meta.env.VITE_S3_PREFIX     ?? "gallery/";

    // ─── Tryb testowy — picsum.photos ────────────────────────────────────────
    const TEST_PHOTOS = Array.from({ length: 18 }, (_, i) => ({
        url: `https://picsum.photos/seed/tattoo${i + 1}/600/800`,
        alt: `tatuaż testowy ${i + 1}`,
    }));

    /** @type {Array<{url: string, alt: string}>} */
    let photos = [];
    let loading = true;

    // ─── Lightbox ────────────────────────────────────────────────────────────
    /** @type {{url: string, alt: string} | null} */
    let selectedPhoto = null;
    /** @type {HTMLElement | null} */
    let lightboxCloseBtn = null;
    /** @type {HTMLElement | null} */
    let lightboxTrigger = null;

    /** @param {{url: string, alt: string}} photo @param {number} dist @param {HTMLElement} trigger */
    function openLightbox(photo, dist, trigger) {
        if (dist > 5) return;
        lightboxTrigger = trigger;
        selectedPhoto = photo;
        // Move focus into the lightbox after Svelte renders it
        tick().then(() => lightboxCloseBtn?.focus());
    }
    function closeLightbox() {
        selectedPhoto = null;
        // Return focus to the card that opened the lightbox
        tick().then(() => lightboxTrigger?.focus());
    }
    /** @param {KeyboardEvent} e */
    function handleLightboxKeydown(e) {
        if (!selectedPhoto) return;
        if (e.key === "Escape") {
            e.preventDefault();
            closeLightbox();
        }
        // Tab / Shift+Tab: only one focusable element (close button) — keep focus on it
        if (e.key === "Tab") {
            e.preventDefault();
            lightboxCloseBtn?.focus();
        }
    }
    /** @param {MouseEvent} e */
    function handleOverlayClick(e) { if (e.target === e.currentTarget) closeLightbox(); }

    // ─── Rows ────────────────────────────────────────────────────────────────
    $: row1 = photos.filter((_, i) => i % 2 === 0);
    $: row2 = photos.filter((_, i) => i % 2 !== 0);

    // ─── JS carousel — single RAF loop ───────────────────────────────────────
    // Direct DOM refs for transform (bypasses Svelte per-frame overhead)
    /** @type {HTMLElement | null} */ let track1 = null;
    /** @type {HTMLElement | null} */ let track2 = null;

    // Half-width of each track (= one set of photos — seamless loop point)
    let halfW1 = 0;
    let halfW2 = 0;

    // Current position (translateX px). Row1 moves left (−), row2 moves right (+).
    let pos1 = 0;
    let pos2 = 0;

    // Auto-scroll speed (px/ms) — matches the old CSS `count * 10s` per lap
    $: autoSpd1 = halfW1 > 0 && row1.length > 0 ? -halfW1 / (row1.length * 10000) : 0;
    $: autoSpd2 = halfW2 > 0 && row2.length > 0 ?  halfW2 / (row2.length * 10000) : 0;

    let hoverPaused = false;

    // Per-row drag
    let r1Drag = false, r1StartX = 0, r1BasePos = 0, r1Dist = 0;
    let r2Drag = false, r2StartX = 0, r2BasePos = 0, r2Dist = 0;

    // Velocity (px/ms) measured from pointer events
    let r1Vel = 0, r1PrevX = 0, r1PrevT = 0;
    let r2Vel = 0, r2PrevX = 0, r2PrevT = 0;

    // When true, velocity carries the row forward after release
    let r1Coasting = false;
    let r2Coasting = false;

    let rafId = 0;
    let lastT = 0;
    let visible = false;

    function loop(/** @type {number} */ t) {
        rafId = requestAnimationFrame(loop);
        if (!visible || halfW1 === 0) { lastT = 0; return; }
        const dt = lastT ? Math.min(t - lastT, 50) : 16;
        lastT = t;

        // ── Row 1 ─────────────────────────────────────────────────────────
        if (!r1Drag) {
            if (r1Coasting) {
                // Exponential friction regardless of frame rate
                r1Vel *= Math.pow(0.92, dt / 16);
                pos1 += r1Vel * dt;
                // Blend into auto-scroll once velocity is close to it
                if (Math.abs(r1Vel) < Math.abs(autoSpd1) * 2) {
                    r1Coasting = false;
                    r1Vel = 0;
                }
            } else if (!hoverPaused) {
                pos1 += autoSpd1 * dt;
            }
            if (halfW1 > 0) {
                while (pos1 < -halfW1) pos1 += halfW1;
                while (pos1 > 0)       pos1 -= halfW1;
            }
        }

        // ── Row 2 ─────────────────────────────────────────────────────────
        if (!r2Drag) {
            if (r2Coasting) {
                r2Vel *= Math.pow(0.92, dt / 16);
                pos2 += r2Vel * dt;
                if (Math.abs(r2Vel) < Math.abs(autoSpd2) * 2) {
                    r2Coasting = false;
                    r2Vel = 0;
                }
            } else if (!hoverPaused) {
                pos2 += autoSpd2 * dt;
            }
            if (halfW2 > 0) {
                while (pos2 < -halfW2) pos2 += halfW2;
                while (pos2 > 0)       pos2 -= halfW2;
            }
        }

        if (track1) track1.style.transform = `translateX(${pos1}px)`;
        if (track2) track2.style.transform = `translateX(${pos2}px)`;
    }

    // ─── Pointer handlers (per row) ──────────────────────────────────────────
    /** @param {PointerEvent} e @param {boolean} isRow2 */
    function onPointerDown(e, isRow2) {
        if (e.button !== 0) return;
        const now = performance.now();
        if (!isRow2) {
            r1Drag = true; r1Coasting = false;
            r1Dist = 0; r1StartX = e.clientX; r1BasePos = pos1;
            r1PrevX = e.clientX; r1PrevT = now; r1Vel = 0;
        } else {
            r2Drag = true; r2Coasting = false;
            r2Dist = 0; r2StartX = e.clientX; r2BasePos = pos2;
            r2PrevX = e.clientX; r2PrevT = now; r2Vel = 0;
        }
    }

    /** @param {PointerEvent} e @param {boolean} isRow2 */
    function onPointerMove(e, isRow2) {
        const now = performance.now();
        if (!isRow2) {
            if (!r1Drag) return;
            const d = e.clientX - r1StartX;
            r1Dist = Math.abs(d);
            pos1 = r1BasePos + d;
            const dt = now - r1PrevT;
            if (dt > 0) r1Vel = (e.clientX - r1PrevX) / dt;
            r1PrevX = e.clientX; r1PrevT = now;
        } else {
            if (!r2Drag) return;
            const d = e.clientX - r2StartX;
            r2Dist = Math.abs(d);
            pos2 = r2BasePos + d;
            const dt = now - r2PrevT;
            if (dt > 0) r2Vel = (e.clientX - r2PrevX) / dt;
            r2PrevX = e.clientX; r2PrevT = now;
        }
    }

    /** @param {boolean} isRow2 */
    function onPointerUp(isRow2) {
        if (!isRow2) {
            if (!r1Drag) return;
            r1Drag = false;
            r1Coasting = Math.abs(r1Vel) > 0.02;
            if (!r1Coasting) r1Vel = 0;
        } else {
            if (!r2Drag) return;
            r2Drag = false;
            r2Coasting = Math.abs(r2Vel) > 0.02;
            if (!r2Coasting) r2Vel = 0;
        }
    }

    // ─── Data fetching ───────────────────────────────────────────────────────
    async function fetchS3Photos() {
        const url = `${S3_LIST_URL}?list-type=2&prefix=${encodeURIComponent(S3_PREFIX)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`S3 list error: ${res.status}`);
        const xml = await res.text();
        return parseS3Xml(xml, S3_PREFIX, S3_PUBLIC_URL);
    }

    onMount(() => {
        // Pause the RAF loop when the section is scrolled out of view.
        // Falls back to always-visible when IntersectionObserver is unavailable (e.g. test env).
        /** @type {IntersectionObserver | null} */
        let observer = null;
        if (typeof IntersectionObserver !== "undefined") {
            observer = new IntersectionObserver(
                ([entry]) => { visible = entry.isIntersecting; },
                { threshold: 0 }
            );
        } else {
            visible = true;
        }

        (async () => {
            try {
                photos = S3_LIST_URL ? await fetchS3Photos() : TEST_PHOTOS;
            } catch (e) {
                console.warn("Galeria: błąd pobierania zdjęć", e);
                photos = TEST_PHOTOS;
            } finally {
                loading = false;
            }
            await tick(); // wait for Svelte to render the tracks
            halfW1 = (track1?.offsetWidth ?? 0) / 2;
            halfW2 = (track2?.offsetWidth ?? 0) / 2;
            pos2 = -halfW2; // row2 starts scrolled left, moves right
            const section = document.getElementById("galeria");
            if (section && observer) observer.observe(section);
            rafId = requestAnimationFrame(loop);
        })();

        return () => {
            cancelAnimationFrame(rafId);
            observer?.disconnect();
        };
    });
</script>

<svelte:window on:keydown={handleLightboxKeydown} />
<!-- keydown is handled on window so Escape works even if focus escapes the overlay -->

<section id="galeria">
    <div class="sep" aria-hidden="true"></div>
    <div class="section-inner">
        <p class="section-num">02 — Galeria</p>
        <h2>Wybrane <em>prace</em></h2>
        <div class="section-divider"></div>
        <p class="intro">
            Każda praca to osobna historia — zajrzyj i znajdź swoją.
        </p>

        {#if loading}
            <div class="loader" aria-label="Ładowanie galerii…">
                <span class="loader-dot"></span>
                <span class="loader-dot"></span>
                <span class="loader-dot"></span>
            </div>
        {:else if photos.length === 0}
            <div class="empty">Galeria jest jeszcze pusta — wróć wkrótce.</div>
        {:else}
            <div
                class="carousels"
                on:mouseenter={() => { hoverPaused = true; }}
                on:mouseleave={() => { hoverPaused = false; }}
                role="region"
                aria-label="Galeria tatuaży"
            >
                <!-- Rząd 1 — przewija w lewo -->
                <div
                    class="track-wrapper"
                    role="group"
                    aria-label="Rząd pierwszy galerii — przeciągnij aby przewijać"
                    on:pointerdown={e => onPointerDown(e, false)}
                    on:pointermove={e => onPointerMove(e, false)}
                    on:pointerup={() => onPointerUp(false)}
                    on:pointerleave={() => onPointerUp(false)}
                    style="cursor: {r1Drag ? 'grabbing' : 'grab'}"
                >
                    <div bind:this={track1} class="track" class:paused={hoverPaused}>
                        {#each [...row1, ...row1] as photo}
                            <button
                                class="card"
                                on:click={e => openLightbox(photo, r1Dist, e.currentTarget)}
                                aria-label="Powiększ: {photo.alt}"
                            >
                                <img
                                    src={photo.url}
                                    alt={photo.alt}
                                    width="600"
                                    height="800"
                                    loading="lazy"
                                    decoding="async"
                                    crossorigin="anonymous"
                                    draggable="false"
                                />
                                <div class="card-overlay"></div>
                                <span class="zoom-hint" aria-hidden="true">⊕</span>
                            </button>
                        {/each}
                    </div>
                </div>

                <!-- Rząd 2 — przewija w prawo -->
                <div
                    class="track-wrapper"
                    role="group"
                    aria-label="Rząd drugi galerii — przeciągnij aby przewijać"
                    on:pointerdown={e => onPointerDown(e, true)}
                    on:pointermove={e => onPointerMove(e, true)}
                    on:pointerup={() => onPointerUp(true)}
                    on:pointerleave={() => onPointerUp(true)}
                    style="cursor: {r2Drag ? 'grabbing' : 'grab'}"
                >
                    <div bind:this={track2} class="track" class:paused={hoverPaused}>
                        {#each [...row2, ...row2] as photo}
                            <button
                                class="card"
                                on:click={e => openLightbox(photo, r2Dist, e.currentTarget)}
                                aria-label="Powiększ: {photo.alt}"
                            >
                                <img
                                    src={photo.url}
                                    alt={photo.alt}
                                    width="600"
                                    height="800"
                                    loading="lazy"
                                    decoding="async"
                                    crossorigin="anonymous"
                                    draggable="false"
                                />
                                <div class="card-overlay"></div>
                                <span class="zoom-hint" aria-hidden="true">⊕</span>
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        {/if}
    </div>
</section>

<!-- ── Lightbox ─────────────────────────────────────────────────────────── -->
{#if selectedPhoto}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
        class="lightbox-overlay"
        transition:fade={{ duration: 250 }}
        on:click={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-label="Powiększone zdjęcie"
        tabindex="-1"
    >
        <button
            bind:this={lightboxCloseBtn}
            class="lightbox-close"
            in:fade={{ duration: 200, delay: 250 }}
            out:fade={{ duration: 150 }}
            on:click={closeLightbox}
            aria-label="Zamknij"
        >✕</button>
        <img
            class="lightbox-img"
            in:scale={{ start: 0.08, duration: 450, easing: quintOut }}
            out:scale={{ start: 0.08, duration: 300, easing: quintIn }}
            src={selectedPhoto.url}
            alt={selectedPhoto.alt}
        />
    </div>
{/if}

<style>
    /* ── Layout ──────────────────────────────────────────── */
    #galeria {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6rem 0;
        background: var(--bg2);
        position: relative;
        overflow: hidden;
    }

    .sep {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 1px;
        height: 80px;
        background: linear-gradient(
            to bottom,
            transparent,
            rgba(214, 9, 5, 0.3),
            transparent
        );
    }

    .section-inner {
        width: 100%;
        animation: fadeUp 0.8s ease both;
    }

    .section-inner > :not(.carousels) {
        max-width: 820px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 2rem;
        padding-right: 2rem;
    }
    .intro {
        margin-bottom: 3rem;
    }

    /* ── Loader ──────────────────────────────────────────── */
    .loader {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: center;
        padding: 4rem;
    }
    .loader-dot {
        width: 8px;
        height: 8px;
        background: var(--red);
        border-radius: 50%;
        animation: blink 1.2s ease-in-out infinite;
    }
    .loader-dot:nth-child(2) { animation-delay: 0.2s; }
    .loader-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink {
        0%, 80%, 100% { opacity: 0.15; transform: scale(0.8); }
        40%            { opacity: 1;    transform: scale(1);   }
    }

    .empty {
        text-align: center;
        padding: 4rem;
        color: rgba(220, 220, 220, 0.35);
        font-size: 0.85rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
    }

    /* ── Carousels ───────────────────────────────────────── */
    .carousels {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
        user-select: none;
    }

    /* ── Track wrapper — clips overflow, fades edges ─────── */
    .track-wrapper {
        overflow: hidden;
        position: relative;
        touch-action: none;
    }
    .track-wrapper::before,
    .track-wrapper::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        width: 120px;
        z-index: 2;
        pointer-events: none;
    }
    .track-wrapper::before {
        left: 0;
        background: linear-gradient(to right, var(--bg2), transparent);
    }
    .track-wrapper::after {
        right: 0;
        background: linear-gradient(to left, var(--bg2), transparent);
    }

    /* ── Track — JS sets transform directly on this element ─ */
    .track {
        display: flex;
        gap: 1rem;
        width: max-content;
        will-change: transform;
    }

    /* ── Card ────────────────────────────────────────────── */
    .card {
        position: relative;
        width: 280px;
        height: 320px;
        flex-shrink: 0;
        overflow: hidden;
        cursor: none;
        background: none;
        border: none;
        padding: 0;
    }

    .card img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition:
            transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            filter 0.45s ease,
            box-shadow 0.45s ease;
        filter: brightness(0.85);
        pointer-events: none;
    }

    .card-overlay {
        position: absolute;
        inset: 0;
        background: rgba(10, 8, 8, 0.35);
        transition: opacity 0.45s ease;
        pointer-events: none;
    }

    .zoom-hint {
        position: absolute;
        bottom: 10px;
        right: 12px;
        color: rgba(255, 218, 227, 0);
        font-size: 1.3rem;
        transition: color 0.3s ease;
        z-index: 3;
        pointer-events: none;
        line-height: 1;
    }

    /* ── Hover ───────────────────────────────────────────── */
    .card:hover img {
        transform: scale(1.08);
        filter: brightness(1.05);
        box-shadow:
            0 20px 60px rgba(0, 0, 0, 0.7),
            0 0 0 2px rgba(214, 9, 5, 0.4);
    }
    .card:hover .card-overlay { opacity: 0; }
    .card:hover .zoom-hint { color: rgba(255, 218, 227, 0.75); }

    :global(.carousels:has(.card:hover) .card:not(:hover)) img {
        filter: brightness(0.45);
    }
    :global(.carousels:has(.card:hover) .card:not(:hover)) .card-overlay {
        opacity: 1;
        background: rgba(10, 8, 8, 0.55);
    }

    /* ── Lightbox ────────────────────────────────────────── */
    .lightbox-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(8, 6, 6, 0.92);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        cursor: zoom-out;
    }

    .lightbox-img {
        max-width: 90vw;
        max-height: 90vh;
        object-fit: contain;
        box-shadow:
            0 30px 100px rgba(0, 0, 0, 0.8),
            0 0 0 1px rgba(214, 9, 5, 0.25);
        cursor: default;
    }

    .lightbox-close {
        position: absolute;
        top: 1.5rem;
        right: 1.5rem;
        background: none;
        border: 1px solid rgba(214, 9, 5, 0.35);
        color: var(--ink2);
        font-size: 1rem;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition:
            border-color 0.25s,
            color 0.25s,
            background 0.25s;
        z-index: 1;
    }
    .lightbox-close:hover {
        border-color: var(--red);
        color: var(--pink);
        background: rgba(214, 9, 5, 0.1);
    }

    /* ── Responsive ──────────────────────────────────────── */
    @media (max-width: 640px) {
        .card { width: 200px; height: 230px; }
        .track-wrapper::before,
        .track-wrapper::after { width: 60px; }
    }
</style>
