<script>
    import { onMount, onDestroy } from "svelte";

    // Zawiszy Czarnego 22, Gliwice
    const STUDIO_LAT = 50.2892389;
    const STUDIO_LNG = 18.6506629;
    const STUDIO_NAME = "Będzie Igła! — Gosia Wiśniewska Tattoo";
    const STUDIO_ADDRESS = "ul. Zawiszy Czarnego 22, Gliwice";

    /** @type {HTMLDivElement} */
    let mapEl;
    /** @type {import('leaflet').Map | null} */
    let map = null;
    /** @type {import('leaflet').Marker | null} */
    let userMarker = null;
    /** @type {import('leaflet').LayerGroup | null} */
    let routeLayer = null;
    let routeStatus = "idle"; // 'idle' | 'locating' | 'routing' | 'done' | 'error'
    let routeError = "";
    let userLat = 0;
    let userLng = 0;

    // Paleta barw do stylizacji mapy
    const RED = "#d60905";
    const PINK = "#ffdae3";
    const DARK = "#2e3033";
    const DARK2 = "#1a1c1f";

    // SVG pineska studia — czerwona
    const studioIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 56" width="40" height="56">
      <defs>
        <filter id="shadow" x="-30%" y="-10%" width="160%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.5)"/>
        </filter>
      </defs>
      <path d="M20 0C9 0 0 9 0 20c0 15 20 36 20 36s20-21 20-36C40 9 31 0 20 0z"
            fill="${RED}" filter="url(#shadow)"/>
      <circle cx="20" cy="20" r="8" fill="white" opacity="0.9"/>
      <circle cx="20" cy="20" r="5" fill="${RED}"/>
    </svg>`;

    // SVG pineska użytkownika — różowa
    const userIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44" width="32" height="44">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28S32 28 32 16C32 7.2 24.8 0 16 0z"
            fill="${PINK}" opacity="0.9"/>
      <circle cx="16" cy="16" r="6" fill="white" opacity="0.85"/>
    </svg>`;

    onMount(() => {
        (async () => {
            // Leaflet importujemy dynamicznie — SSR-safe
            const L = (await import("leaflet")).default;
            await import("leaflet/dist/leaflet.css");

            // ── Inicjalizacja mapy ─────────────────────────────
            map = L.map(mapEl, {
                center: [STUDIO_LAT, STUDIO_LNG],
                zoom: 16,
                zoomControl: false,
                attributionControl: false,
            });

            // Ciemne kafelki CartoDB — pasują do kolorystyki
            L.tileLayer(
                "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
                { subdomains: "abcd", maxZoom: 19 },
            ).addTo(map);

            // Atrybucja — schowana ale legalnie obecna
            L.control
                .attribution({ prefix: false, position: "bottomright" })
                .addAttribution(
                    '© <a href="https://carto.com">CARTO</a> © <a href="https://osm.org/copyright">OpenStreetMap</a>',
                )
                .addTo(map);

            // Kontrolka zoom — stylizowana, prawa strona
            L.control.zoom({ position: "bottomright" }).addTo(map);

            // ── Marker studia ──────────────────────────────────
            const studioIcon = L.divIcon({
                html: studioIconSvg,
                className: "",
                iconSize: [40, 56],
                iconAnchor: [20, 56],
                popupAnchor: [0, -58],
            });

            L.marker([STUDIO_LAT, STUDIO_LNG], {
                icon: studioIcon,
            })
                .addTo(map)
                .bindPopup(
                    `
        <div class="popup-inner">
          <strong>${STUDIO_NAME}</strong>
          <span>${STUDIO_ADDRESS}</span>
          <a href="https://maps.google.com/?q=${STUDIO_LAT},${STUDIO_LNG}" target="_blank" rel="noopener">
            Otwórz w Google Maps ↗
          </a>
        </div>
      `,
                    { className: "custom-popup", maxWidth: 220 },
                )
                .openPopup();
        })();

        return () => {
            if (map) map.remove();
        };
    });

    onDestroy(() => {
        if (map) map.remove();
    });

    // ── Wyznacz trasę ──────────────────────────────────────
    async function getRoute() {
        if (routeStatus === "locating" || routeStatus === "routing") return;
        routeStatus = "locating";
        routeError = "";

        if (!navigator.geolocation) {
            routeStatus = "error";
            routeError = "Twoja przeglądarka nie obsługuje geolokalizacji.";
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                if (!map) return;
                const { latitude: lat, longitude: lng } = pos.coords;
                userLat = lat;
                userLng = lng;
                routeStatus = "routing";

                const L = (await import("leaflet")).default;

                // Usuń poprzednią trasę i marker
                if (routeLayer) {
                    map.removeLayer(routeLayer);
                    routeLayer = null;
                }
                if (userMarker) {
                    map.removeLayer(userMarker);
                    userMarker = null;
                }

                // Marker użytkownika
                const uIcon = L.divIcon({
                    html: userIconSvg,
                    className: "",
                    iconSize: [32, 44],
                    iconAnchor: [16, 44],
                    popupAnchor: [0, -46],
                });
                userMarker = L.marker([lat, lng], { icon: uIcon })
                    .addTo(map)
                    .bindPopup(
                        '<div class="popup-inner"><strong>Twoja lokalizacja</strong></div>',
                        { className: "custom-popup" },
                    );

                // Routing bezpośrednio przez OSRM API z timeoutem 10s
                const abort = new AbortController();
                const timer = setTimeout(() => abort.abort(), 10000);

                try {
                    const res = await fetch(
                        `https://router.project-osrm.org/route/v1/driving/${lng},${lat};${STUDIO_LNG},${STUDIO_LAT}?overview=full&geometries=geojson`,
                        { signal: abort.signal },
                    );
                    clearTimeout(timer);

                    if (!res.ok) throw new Error(`OSRM ${res.status}`);
                    const data = await res.json();
                    if (!data.routes?.length) throw new Error("brak trasy");

                    // Współrzędne GeoJSON są [lng, lat] — odwracamy dla Leaflet
                    const coords = data.routes[0].geometry.coordinates.map(
                        (/** @type {[number, number]} */ c) =>
                            /** @type {[number, number]} */ ([c[1], c[0]]),
                    );

                    routeLayer = L.layerGroup([
                        L.polyline(coords, {
                            color: DARK,
                            weight: 7,
                            opacity: 0.55,
                        }),
                        L.polyline(coords, {
                            color: RED,
                            weight: 3,
                            opacity: 0.9,
                        }),
                    ]).addTo(map);

                    map.fitBounds(L.polyline(coords).getBounds(), {
                        padding: [50, 50],
                    });
                    routeStatus = "done";
                } catch {
                    clearTimeout(timer);
                    routeStatus = "error";
                    routeError =
                        "Nie udało się wyznaczyć trasy. Skorzystaj z Google Maps.";
                }
            },
            (err) => {
                routeStatus = "error";
                routeError =
                    err.code === 1
                        ? "Odmówiono dostępu do lokalizacji. Sprawdź uprawnienia przeglądarki."
                        : "Nie udało się pobrać lokalizacji. Spróbuj ponownie.";
            },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    function clearRoute() {
        if (!map) return;
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
        if (userMarker) {
            map.removeLayer(userMarker);
            userMarker = null;
        }
        map.setView([STUDIO_LAT, STUDIO_LNG], 16);
        routeStatus = "idle";
        routeError = "";
        userLat = 0;
        userLng = 0;
    }
</script>

<div class="mapa-section">
    <!-- ── Nagłówek ──────────────────────────────────────── -->
    <div class="mapa-header">
        <span class="mapa-label">Jak trafić?</span>
        <span class="mapa-deco" aria-hidden="true">◎</span>
    </div>

    <!-- ── Mapa ──────────────────────────────────────────── -->
    <div class="map-container">
        <div
            bind:this={mapEl}
            class="map"
            aria-label="Mapa dojazdu do studia"
        ></div>
    </div>

    <!-- ── Przyciski trasy ────────────────────────────────── -->
    <div class="route-controls">
        {#if routeStatus !== "done"}
            <button
                class="btn-route"
                on:click={getRoute}
                disabled={routeStatus === "locating" ||
                    routeStatus === "routing"}
                aria-busy={routeStatus === "locating" ||
                    routeStatus === "routing"}
            >
                {#if routeStatus === "locating"}
                    <span class="spinner" aria-hidden="true"></span> Pobieranie lokalizacji…
                {:else if routeStatus === "routing"}
                    <span class="spinner" aria-hidden="true"></span> Wyznaczam trasę…
                {:else}
                    <span class="btn-icon">◎</span> Wyznacz trasę z mojej lokalizacji
                {/if}
            </button>
        {:else}
            <button class="btn-route btn-clear" on:click={clearRoute}>
                <span class="btn-icon">✕</span> Wyczyść trasę
            </button>
        {/if}

        {#if routeError}
            <p class="route-error" role="alert">{routeError}</p>
            <a
                href="https://www.google.com/maps/dir/{userLat && userLng
                    ? `${userLat},${userLng}`
                    : ''}/{STUDIO_LAT},{STUDIO_LNG}"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-route btn-maps"
            >
                <span class="btn-icon">◎</span> Otwórz trasę w Google Maps ↗
            </a>
        {/if}
    </div>

    <!-- ── Informacje dojazd ──────────────────────────────── -->
    <div class="transport-grid">
        <div class="transport-card">
            <div class="transport-icon">🚌</div>
            <div>
                <strong>Komunikacja miejska</strong>
                <ul>
                    <li>
                        Przystanki <em>Gliwice Sobieskiego</em> i
                        <em>Gliwice Słowackiego</em>
                        — autobusy
                        <em>186, A4, A4N</em>
                    </li>
                    <li>Spacer ok. 3–5 min od obu przystanków</li>
                </ul>
            </div>
        </div>

        <div class="transport-card">
            <div class="transport-icon">🚗</div>
            <div>
                <strong>Parking</strong>
                <ul>
                    <li>
                        Bezpłatny parking przy ul. Zawiszy Czarnego (wzdłuż
                        ulicy)
                    </li>
                </ul>
            </div>
        </div>
    </div>
</div>

<style>
    /* ── Wrapper ─────────────────────────────────────────── */
    .mapa-section {
        margin-top: 4rem;
        border: 1px solid rgba(214, 9, 5, 0.18);
        padding: 2.5rem;
        background: rgba(0, 0, 0, 0.25);
        position: relative;
    }
    .mapa-section::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 60px;
        height: 3px;
        background: linear-gradient(90deg, var(--red), transparent);
    }

    /* ── Header ──────────────────────────────────────────── */
    .mapa-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1.5rem;
    }
    .mapa-label {
        font-size: calc(0.6rem + 4px);
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: var(--red);
    }
    .mapa-deco {
        color: rgba(214, 9, 5, 0.25);
        font-size: 0.9rem;
    }

    /* ── Map ─────────────────────────────────────────────── */
    .map-container {
        position: relative;
        width: 100%;
        height: 380px;
        border: 1px solid rgba(214, 9, 5, 0.18);
        overflow: hidden;
    }

    .map {
        width: 100%;
        height: 100%;
        background: #1a1c1f;
    }

    /* Leaflet zoom buttons override */
    :global(.leaflet-control-zoom a) {
        background: #2e3033 !important;
        color: #c9c9c9 !important;
        border-color: rgba(214, 9, 5, 0.25) !important;
        transition:
            background 0.2s,
            color 0.2s !important;
    }
    :global(.leaflet-control-zoom a:hover) {
        background: rgba(214, 9, 5, 0.2) !important;
        color: #fff !important;
    }
    :global(.leaflet-bar) {
        border: 1px solid rgba(214, 9, 5, 0.25) !important;
        box-shadow: none !important;
    }

    /* Attribution */
    :global(.leaflet-control-attribution) {
        background: rgba(46, 48, 51, 0.85) !important;
        color: rgba(201, 201, 201, 0.4) !important;
        font-size: 0.55rem !important;
    }
    :global(.leaflet-control-attribution a) {
        color: rgba(214, 9, 5, 0.6) !important;
    }

    /* ── Custom popup ────────────────────────────────────── */
    :global(.custom-popup .leaflet-popup-content-wrapper) {
        background: #2e3033 !important;
        border: 1px solid rgba(214, 9, 5, 0.3) !important;
        border-radius: 0 !important;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6) !important;
        color: #fff !important;
    }
    :global(.custom-popup .leaflet-popup-tip) {
        background: #2e3033 !important;
    }
    :global(.popup-inner) {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-family: "Cormorant Garamond", serif;
        font-size: 0.9rem;
    }
    :global(.popup-inner strong) {
        color: #ffdae3;
        font-size: 0.85rem;
        letter-spacing: 0.05em;
    }
    :global(.popup-inner span) {
        color: #c9c9c9;
        font-size: 0.78rem;
    }
    :global(.popup-inner a) {
        color: #d60905;
        font-size: 0.75rem;
        text-decoration: none;
        margin-top: 4px;
        letter-spacing: 0.05em;
    }
    :global(.popup-inner a:hover) {
        color: #ffdae3;
    }

    /* ── Route controls ──────────────────────────────────── */
    .route-controls {
        margin-top: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .btn-route {
        align-self: flex-start;
        background: transparent;
        border: 1px solid rgba(214, 9, 5, 0.35);
        color: var(--ink2);
        font-family: var(--font-body);
        font-size: 0.85rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        padding: 0.75rem 1.5rem;
        cursor: none;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        transition:
            background 0.3s,
            border-color 0.3s,
            color 0.3s;
    }
    .btn-route:hover {
        background: rgba(214, 9, 5, 0.1);
        border-color: var(--red);
        color: var(--pink);
    }
    .btn-route:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .btn-clear {
        border-color: rgba(201, 201, 201, 0.2);
    }
    .btn-clear:hover {
        background: rgba(201, 201, 201, 0.05);
        border-color: rgba(201, 201, 201, 0.4);
        color: var(--grey);
    }
    .btn-maps {
        text-decoration: none;
        border-color: rgba(214, 9, 5, 0.25);
    }
    .btn-icon {
        color: var(--red);
        font-size: 0.9rem;
    }

    .spinner {
        width: 12px;
        height: 12px;
        border: 1.5px solid rgba(214, 9, 5, 0.3);
        border-top-color: var(--red);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .route-error {
        font-size: 0.72rem;
        color: var(--pink-dk);
        letter-spacing: 0.05em;
        padding: 0.5rem 0;
    }

    /* ── Transport info grid ─────────────────────────────── */
    .transport-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-top: 1.5rem;
    }

    .transport-card {
        display: flex;
        gap: 1rem;
        padding: 1.2rem;
        border: 1px solid rgba(214, 9, 5, 0.12);
        background: rgba(255, 255, 255, 0.015);
        align-items: flex-start;
        transition: border-color 0.3s;
    }
    .transport-card:hover {
        border-color: rgba(214, 9, 5, 0.3);
    }

    .transport-icon {
        font-size: 2rem;
        flex-shrink: 0;
        margin-top: 2px;
    }

    .transport-card strong {
        display: block;
        font-size: 0.9rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--pink-dk);
        margin-bottom: 0.6rem;
    }

    .transport-card ul {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .transport-card li {
        font-size: 1rem;
        color: var(--ink2);
        line-height: 1.5;
        padding-left: 0.8rem;
        position: relative;
    }
    .transport-card li::before {
        content: "—";
        position: absolute;
        left: 0;
        color: rgba(214, 9, 5, 0.4);
        font-size: 0.7rem;
    }
    .transport-card em {
        color: var(--pink);
        font-style: normal;
    }

    @media (max-width: 600px) {
        .mapa-section {
            padding: 1.5rem;
        }
        .map-container {
            height: 280px;
        }
        .transport-grid {
            grid-template-columns: 1fr;
        }
        .btn-route {
            width: 100%;
            justify-content: center;
        }
    }
</style>
