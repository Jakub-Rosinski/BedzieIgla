<script>
    import { onMount } from "svelte";

    let imploding = false;
    let glowing = false;
    let mounted = false;

    // Zakładki równo co 120°, zaczynając od północy (-90°)
    const items = [
        { href: "#o-mnie", label: "O MNIE", angle: -90 },
        { href: "#galeria", label: "GALERIA", angle: 30 },
        { href: "#kontakt", label: "KONTAKT", angle: 150 },
    ];

    /** @type {Record<string, boolean>} */
    let hovered = { "#o-mnie": false, "#galeria": false, "#kontakt": false };

    const CX = 230;
    const CY = 230;
    const R = 192; // promień tekstu

    const toRad = (/** @type {number} */ d) => (d * Math.PI) / 180;

    // Łuk SVG — dla dolnej półkuli odwracamy kierunek żeby tekst był czytelny
    function arcPath(/** @type {number} */ angle, span = 42) {
        const inBottom = angle > 0 && angle < 240;
        const a1 = inBottom ? angle + span : angle - span;
        const a2 = inBottom ? angle - span : angle + span;
        const sweep = inBottom ? 0 : 1;

        const x1 = CX + R * Math.cos(toRad(a1));
        const y1 = CY + R * Math.sin(toRad(a1));
        const x2 = CX + R * Math.cos(toRad(a2));
        const y2 = CY + R * Math.sin(toRad(a2));
        return `M ${x1} ${y1} A ${R} ${R} 0 0 ${sweep} ${x2} ${y2}`;
    }

    function navigate(/** @type {MouseEvent} */ e, /** @type {string} */ href) {
        e.preventDefault();
        if (imploding) return;
        imploding = true;
        setTimeout(() => {
            glowing = true;
            document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
            setTimeout(() => {
                glowing = false;
                imploding = false;
            }, 650);
        }, 560);
    }

    onMount(() => {
        // Opóźnienie żeby entry animation zadziałała po renderze
        requestAnimationFrame(() => {
            mounted = true;
        });
    });
</script>

<div class="wheel-wrapper" class:imploding class:glowing class:mounted>
    <!-- ── Dekoracyjne pierścienie tła (CSS animated) ─────── -->
    <div class="orbit-rings" aria-hidden="true">
        <div class="orbit-ring r1"></div>
        <div class="orbit-ring r2"></div>
        <div class="orbit-ring r3"></div>
        <div class="orbit-ring r4"></div>
        <div class="orbit-ring r5"></div>
        <div class="orbit-ring r6"></div>
    </div>

    <!-- ── Orbitujące cząstki ─────────────────────────────── -->
    <div class="particles" aria-hidden="true">
        <div class="particle p1"></div>
        <div class="particle p2"></div>
        <div class="particle p3"></div>
        <div class="particle p4"></div>
    </div>

    <!-- ── SVG koła ────────────────────────────────────────── -->
    <svg
        class="wheel-svg"
        viewBox="0 0 460 460"
        xmlns="http://www.w3.org/2000/svg"
        role="navigation"
        aria-label="Menu główne"
    >
        <defs>
            <clipPath id="logoClip">
                <circle cx="230" cy="230" r="98" />
            </clipPath>

            <!-- Poświata hover na tekście -->
            <filter id="text-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge
                    ><feMergeNode in="blur" /><feMergeNode
                        in="SourceGraphic"
                    /></feMerge
                >
            </filter>

            <!-- Gradient pierścienia obrotowego -->
            <linearGradient
                id="ring-grad"
                gradientUnits="userSpaceOnUse"
                x1="230"
                y1="18"
                x2="230"
                y2="442"
            >
                <stop offset="0%" stop-color="#d60905" stop-opacity="0.9" />
                <stop offset="50%" stop-color="#e9999b" stop-opacity="0.5" />
                <stop offset="100%" stop-color="#d60905" stop-opacity="0.9" />
            </linearGradient>

            <!-- Gradient wypełnienia logo-bg -->
            <radialGradient id="logo-bg-grad" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stop-color="#3a2020" />
                <stop offset="100%" stop-color="#2e3033" />
            </radialGradient>

            <!-- Ścieżki łuków dla tekstów -->
            {#each items as item}
                <path
                    id="arc-{item.href.slice(1)}"
                    d={arcPath(item.angle)}
                    fill="none"
                />
            {/each}
        </defs>

        <!-- Pierścień obrotowy z gradientem — efekt "neonowy" -->
        <circle class="ring-neon" cx="230" cy="230" r="212" />

        <!-- Główny pierścień zewnętrzny -->
        <circle class="ring-main" cx="230" cy="230" r="210" />

        <!-- Drugi pierścień — przerywany gruby -->
        <circle class="ring-dashed-a" cx="230" cy="230" r="195" />

        <!-- Trzeci — cienki blisko środka -->
        <circle class="ring-thin-a" cx="230" cy="230" r="158" />

        <!-- Czwarty — drobno przerywany -->
        <circle class="ring-dashed-b" cx="230" cy="230" r="148" />

        <!-- Piąty — bezpośrednio wokół logo -->
        <circle class="ring-logo-out" cx="230" cy="230" r="112" />

        <!-- Szóty — tuż przy logo -->
        <circle class="ring-logo-in" cx="230" cy="230" r="100" />

        <!-- Szprychy — trzy linie do środka -->
        {#each items as item}
            {@const rad = toRad(item.angle)}
            <line
                class="spoke"
                class:spoke-hovered={hovered[item.href]}
                x1={CX + 112 * Math.cos(rad)}
                y1={CY + 112 * Math.sin(rad)}
                x2={CX + 174 * Math.cos(rad)}
                y2={CY + 174 * Math.sin(rad)}
            />
            <!-- Punkt na obwodzie przy tekście -->
            <circle
                class="spoke-dot"
                class:spoke-dot-hovered={hovered[item.href]}
                cx={CX + 174 * Math.cos(rad)}
                cy={CY + 174 * Math.sin(rad)}
                r="2.5"
            />
        {/each}

        <!-- Zakładki — tekst wzdłuż łuku -->
        {#each items as item}
            <a
                href={item.href}
                class="nav-arc"
                class:nav-hovered={hovered[item.href]}
                on:click={(e) => navigate(e, item.href)}
                on:mouseenter={() => (hovered[item.href] = true)}
                on:mouseleave={() => (hovered[item.href] = false)}
                role="menuitem"
                aria-label={item.label}
            >
                <!-- Szeroka niewidoczna strefa klikalna -->
                <path
                    d={arcPath(item.angle)}
                    fill="none"
                    stroke="transparent"
                    stroke-width="36"
                    class="hit-area"
                />
                <!-- Tekst -->
                <text
                    class="arc-text"
                    filter={hovered[item.href] ? "url(#text-glow)" : ""}
                >
                    <textPath
                        href="#arc-{item.href.slice(1)}"
                        startOffset="50%"
                        text-anchor="middle">{item.label}</textPath
                    >
                </text>
            </a>
        {/each}

        <!-- Logo kołowe w centrum -->
        <a href="/" aria-label="Strona główna" class="logo-link">
            <circle cx="230" cy="230" r="98" class="logo-bg" />
            <image
                href="/logo.png"
                x="132"
                y="132"
                width="196"
                height="196"
                clip-path="url(#logoClip)"
                preserveAspectRatio="xMidYMid slice"
                class="logo-img"
            />
            <circle cx="230" cy="230" r="98" class="logo-ring" />
            <circle cx="230" cy="230" r="108" class="logo-ring-outer" />
        </a>
    </svg>

    <!-- Poświata po implosji -->
    {#if glowing}
        <div class="glow-burst" aria-hidden="true">
            <div class="burst-ring r1"></div>
            <div class="burst-ring r2"></div>
            <div class="burst-ring r3"></div>
        </div>
    {/if}
</div>

<style>
    /* ────────────────────────────────────────────────────── */
    /* WRAPPER                                               */
    /* ────────────────────────────────────────────────────── */
    .wheel-wrapper {
        position: relative;
        width: 480px;
        height: 480px;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
    }

    /* ────────────────────────────────────────────────────── */
    /* DEKORACYJNE PIERŚCIENIE                               */
    /* ────────────────────────────────────────────────────── */
    .orbit-rings {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    .orbit-ring {
        position: absolute;
        top: 50%;
        left: 50%;
        border-radius: 50%;
        transform: translate(-50%, -50%);
    }

    /* r1 — zewnętrzny, powolna rotacja przerywana linia */
    .r1 {
        width: 560px;
        height: 560px;
        border: 1px dashed rgba(214, 9, 5, 0.12);
        animation: spin-cw 80s linear infinite;
    }
    /* r2 — nieco mniejszy, odwrotna rotacja */
    .r2 {
        width: 520px;
        height: 520px;
        border: 1px solid rgba(214, 9, 5, 0.06);
        animation: spin-ccw 60s linear infinite;
    }
    /* r3 — gradient border efekt przez box-shadow */
    .r3 {
        width: 470px;
        height: 470px;
        border: 1px solid transparent;
        box-shadow:
            0 0 0 1px rgba(214, 9, 5, 0.08),
            0 0 20px rgba(214, 9, 5, 0.04);
        animation: spin-cw 40s linear infinite;
    }
    /* r4 — między kołem a tekstem */
    .r4 {
        width: 420px;
        height: 420px;
        border: 1px dashed rgba(233, 153, 155, 0.08);
        animation: spin-ccw 50s linear infinite;
    }
    /* r5 — blisko koła */
    .r5 {
        width: 380px;
        height: 380px;
        border: 1px solid rgba(214, 9, 5, 0.05);
    }
    /* r6 — wewnętrzny, szybszy */
    .r6 {
        width: 300px;
        height: 300px;
        border: 1px dashed rgba(255, 218, 227, 0.06);
        animation: spin-cw 25s linear infinite;
    }

    @keyframes spin-cw {
        to {
            transform: translate(-50%, -50%) rotate(360deg);
        }
    }
    @keyframes spin-ccw {
        to {
            transform: translate(-50%, -50%) rotate(-360deg);
        }
    }

    /* ────────────────────────────────────────────────────── */
    /* ORBITUJĄCE CZĄSTKI  ← to jest niespodzianka          */
    /* ────────────────────────────────────────────────────── */
    .particles {
        position: absolute;
        inset: 0;
        pointer-events: none;
    }

    /* Każda cząstka orbituje przez rotate(θ) + translateX(r) + rotate(-θ)
     Zewnętrzna rotacja obraca pozycję wokół centrum,
     wewnętrzna kontrrotacja sprawia że cząstka pozostaje okrągła */
    .particle {
        position: absolute;
        top: 50%;
        left: 50%;
        border-radius: 50%;
        transform-origin: center center;
        margin-top: -3px;
        margin-left: -3px;
    }

    /* p1 — mała czerwona, wolna orbita zewnętrzna */
    .p1 {
        width: 6px;
        height: 6px;
        background: #d60905;
        box-shadow: 0 0 8px 3px rgba(214, 9, 5, 0.6);
        animation: orbit-p1 18s linear infinite;
    }
    @keyframes orbit-p1 {
        from {
            transform: rotate(0deg) translateX(245px) rotate(0deg);
        }
        to {
            transform: rotate(360deg) translateX(245px) rotate(-360deg);
        }
    }

    /* p2 — różowa, szybsza, mniejsza orbita */
    .p2 {
        width: 4px;
        height: 4px;
        background: #ffdae3;
        box-shadow: 0 0 6px 3px rgba(255, 218, 227, 0.5);
        animation: orbit-p2 11s linear infinite;
        animation-delay: -4s;
    }
    @keyframes orbit-p2 {
        from {
            transform: rotate(120deg) translateX(210px) rotate(-120deg);
        }
        to {
            transform: rotate(480deg) translateX(210px) rotate(-480deg);
        }
    }

    /* p3 — ciemnoczerwona, odwrotna orbita, średni pierścień */
    .p3 {
        width: 5px;
        height: 5px;
        background: #a40600;
        box-shadow: 0 0 7px 3px rgba(164, 6, 0, 0.55);
        animation: orbit-p3 24s linear infinite;
        animation-delay: -8s;
    }
    @keyframes orbit-p3 {
        from {
            transform: rotate(240deg) translateX(265px) rotate(-240deg);
        }
        to {
            transform: rotate(-120deg) translateX(265px) rotate(120deg);
        }
    }

    /* p4 — malutka różowa, bardzo wewnętrzna szybka */
    .p4 {
        width: 3px;
        height: 3px;
        background: #e9999b;
        box-shadow: 0 0 5px 2px rgba(233, 153, 155, 0.5);
        animation: orbit-p4 7s linear infinite;
        animation-delay: -2s;
    }
    @keyframes orbit-p4 {
        from {
            transform: rotate(60deg) translateX(175px) rotate(-60deg);
        }
        to {
            transform: rotate(420deg) translateX(175px) rotate(-420deg);
        }
    }

    /* Cząstki zatrzymują się przy implosji */
    .imploding .particle,
    .imploding .orbit-ring {
        animation-play-state: paused;
    }

    /* ────────────────────────────────────────────────────── */
    /* ENTRY ANIMATION                                       */
    /* ────────────────────────────────────────────────────── */
    .wheel-svg {
        width: 460px;
        height: 460px;
        overflow: visible;
        /* implosja */
        transition:
            transform 0.56s cubic-bezier(0.55, 0, 1, 0.45),
            opacity 0.56s ease;
        /* entry — startuje jako invisible, .mounted je ujawnia */
        opacity: 0;
        transform: scale(0.7) rotate(-15deg);
    }
    .mounted .wheel-svg {
        opacity: 1;
        transform: scale(1) rotate(0deg);
        transition:
            transform 1.1s cubic-bezier(0.34, 1.56, 0.64, 1),
            opacity 0.8s ease;
    }
    .imploding .wheel-svg {
        transform: scale(0) !important;
        opacity: 0 !important;
        transition:
            transform 0.56s cubic-bezier(0.55, 0, 1, 0.45),
            opacity 0.56s ease !important;
    }
    .imploding .orbit-rings,
    .imploding .particles {
        opacity: 0;
        transition: opacity 0.3s;
    }

    /* ────────────────────────────────────────────────────── */
    /* SVG PIERŚCIENIE                                       */
    /* ────────────────────────────────────────────────────── */
    .ring-neon {
        fill: none;
        stroke: url(#ring-grad);
        stroke-width: 1;
        opacity: 0.35;
    }
    .ring-main {
        fill: none;
        stroke: rgba(214, 9, 5, 0.3);
        stroke-width: 1.5;
        transition: stroke-opacity 0.4s;
    }
    .wheel-svg:hover .ring-main {
        stroke: rgba(214, 9, 5, 0.55);
    }

    .ring-dashed-a {
        fill: none;
        stroke: rgba(214, 9, 5, 0.12);
        stroke-width: 1;
        stroke-dasharray: 2 8;
    }
    .ring-thin-a {
        fill: none;
        stroke: rgba(233, 153, 155, 0.1);
        stroke-width: 1;
    }
    .ring-dashed-b {
        fill: none;
        stroke: rgba(214, 9, 5, 0.08);
        stroke-width: 1;
        stroke-dasharray: 1 5;
    }
    .ring-logo-out {
        fill: none;
        stroke: rgba(214, 9, 5, 0.2);
        stroke-width: 1;
        stroke-dasharray: 3 4;
    }
    .ring-logo-in {
        fill: none;
        stroke: rgba(214, 9, 5, 0.3);
        stroke-width: 1.5;
        transition: stroke 0.35s;
    }

    /* ────────────────────────────────────────────────────── */
    /* SZPRYCHY                                              */
    /* ────────────────────────────────────────────────────── */
    .spoke {
        stroke: rgba(214, 9, 5, 0.13);
        stroke-width: 1;
        transition:
            stroke 0.3s,
            stroke-width 0.3s;
    }
    .spoke-hovered {
        stroke: rgba(214, 9, 5, 0.55);
        stroke-width: 1.5;
    }
    .spoke-dot {
        fill: rgba(214, 9, 5, 0.18);
        transition:
            fill 0.3s,
            r 0.3s;
    }
    .spoke-dot-hovered {
        fill: rgba(214, 9, 5, 0.8);
    }

    /* ────────────────────────────────────────────────────── */
    /* LOGO                                                  */
    /* ────────────────────────────────────────────────────── */
    .logo-link {
        cursor: none;
    }

    .logo-bg {
        fill: url(#logo-bg-grad);
        stroke: rgba(214, 9, 5, 0.22);
        stroke-width: 1.5;
        transition: stroke 0.35s;
    }
    .logo-link:hover .logo-bg {
        stroke: rgba(214, 9, 5, 0.65);
    }


    .logo-img {
        transition: filter 0.4s;
        filter: drop-shadow(0 0 8px rgba(214, 9, 5, 0.2));
    }
    .logo-link:hover .logo-img {
        filter: drop-shadow(0 0 20px rgba(214, 9, 5, 0.55)) brightness(1.06);
    }

    .logo-ring {
        fill: none;
        stroke: rgba(214, 9, 5, 0.28);
        stroke-width: 1;
        pointer-events: none;
    }
    .logo-ring-outer {
        fill: none;
        stroke: rgba(214, 9, 5, 0.1);
        stroke-width: 1;
        stroke-dasharray: 2 6;
        pointer-events: none;
        transition: stroke 0.35s;
    }
    .logo-link:hover .logo-ring-outer {
        stroke: rgba(214, 9, 5, 0.3);
    }

    /* ────────────────────────────────────────────────────── */
    /* ARC TEXT                                              */
    /* ────────────────────────────────────────────────────── */
    .nav-arc {
        cursor: none;
    }
    .hit-area {
        cursor: none;
    }

    .arc-text {
        font-family: "Cormorant Garamond", serif;
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 0.28em;
        fill: rgba(201, 201, 201, 0.5);
        transition: fill 0.3s;
        user-select: none;
    }
    .nav-hovered .arc-text {
        fill: #ffdae3;
    }

    /* ────────────────────────────────────────────────────── */
    /* IMPLOSION GLOW BURST                                  */
    /* ────────────────────────────────────────────────────── */
    .glow-burst {
        position: absolute;
        inset: 0;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .burst-ring {
        position: absolute;
        border-radius: 50%;
        border: 2px solid rgba(214, 9, 5, 0.6);
    }
    .burst-ring.r1 {
        width: 10px;
        height: 10px;
        animation: burst-expand 0.65s ease-out forwards;
    }
    .burst-ring.r2 {
        width: 10px;
        height: 10px;
        animation: burst-expand 0.65s ease-out 0.08s forwards;
        opacity: 0.7;
    }
    .burst-ring.r3 {
        width: 10px;
        height: 10px;
        animation: burst-expand 0.65s ease-out 0.16s forwards;
        opacity: 0.4;
    }

    @keyframes burst-expand {
        0% {
            transform: scale(0.5);
            opacity: 1;
            border-color: rgba(255, 218, 227, 0.9);
        }
        50% {
            transform: scale(20);
            opacity: 0.6;
            border-color: rgba(214, 9, 5, 0.5);
        }
        100% {
            transform: scale(40);
            opacity: 0;
            border-color: rgba(214, 9, 5, 0);
        }
    }

    /* ────────────────────────────────────────────────────── */
    /* RESPONSIVE                                            */
    /* ────────────────────────────────────────────────────── */
    @media (max-width: 540px) {
        .wheel-wrapper {
            width: 320px;
            height: 320px;
        }
        .wheel-svg {
            width: 320px;
            height: 320px;
        }
        .orbit-ring.r1 {
            width: 390px;
            height: 390px;
        }
        .orbit-ring.r2 {
            width: 360px;
            height: 360px;
        }
        .orbit-ring.r3 {
            width: 330px;
            height: 330px;
        }
        .orbit-ring.r4 {
            width: 295px;
            height: 295px;
        }
        .orbit-ring.r5 {
            width: 266px;
            height: 266px;
        }
        .orbit-ring.r6 {
            width: 210px;
            height: 210px;
        }
        @keyframes orbit-p1 {
            from {
                transform: rotate(0deg) translateX(170px) rotate(0deg);
            }
            to {
                transform: rotate(360deg) translateX(170px) rotate(-360deg);
            }
        }
        @keyframes orbit-p2 {
            from {
                transform: rotate(120deg) translateX(147px) rotate(-120deg);
            }
            to {
                transform: rotate(480deg) translateX(147px) rotate(-480deg);
            }
        }
        @keyframes orbit-p3 {
            from {
                transform: rotate(240deg) translateX(186px) rotate(-240deg);
            }
            to {
                transform: rotate(-120deg) translateX(186px) rotate(120deg);
            }
        }
        @keyframes orbit-p4 {
            from {
                transform: rotate(60deg) translateX(122px) rotate(-60deg);
            }
            to {
                transform: rotate(420deg) translateX(122px) rotate(-420deg);
            }
        }
    }
</style>
