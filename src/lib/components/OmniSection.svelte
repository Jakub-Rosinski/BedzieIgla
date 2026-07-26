<section id="o-mnie">
    <div class="sep" aria-hidden="true"></div>
    <div class="section-inner">
        <!-- ── Gosia ──────────────────────────────────────────── -->
        <div class="artist-block">
            <div class="portrait">
                <img
                    src="/gosia-photo.jpg"
                    alt="Gosia Wiśniewska — tatuatorka w studiu tatuażu Będzie Igła! w Gliwicach"
                    width="800"
                    height="902"
                    loading="lazy"
                    decoding="async"
                />
                <div class="stucco-corners">
                    <span></span><span></span><span></span><span></span>
                </div>
            </div>

            <div class="text-block">
                <p class="section-num">01 — O mnie</p>
                <h2>Gosia</h2>
                <h3>Tworzę <em>z pasją</em> i intencją</h3>
                <div class="section-divider"></div>
                <p>
                    Mam na imię Gosia i tatuaż to dla mnie coś więcej niż rzemiosło
                    – to forma opowiadania historii na skórze.
                </p>
                <p class="mt">
                    Swoją drogę artystyczną zaczęłam w liceum plastycznym w Kielcach,
                    gdzie ukończyłam kierunek technik malarskich i pozłotniczych,
                    uzyskując najwyższą ocenę z dyplomu. Następnie rozwijałam się na
                    Akademii Sztuk Pięknych w Łodzi, kończąc licencjat z projektowania
                    ubioru. To właśnie tam nauczyłam się patrzeć na ciało jak na formę,
                    którą można świadomie „ubierać" – dziś robię to za pomocą tatuażu.
                </p>
                <p class="mt">
                    Dzięki solidnemu wykształceniu artystycznemu i szerokiemu
                    warsztatowi jestem bardzo uniwersalna – tworzę w różnych stylach,
                    dopasowując projekt do osoby, a nie odwrotnie. Każdy tatuaż traktuję
                    indywidualnie, bo za każdym stoi czyjaś historia.
                </p>
                <p class="mt">
                    W moim studiu stawiam nie tylko na estetykę, ale też na atmosferę.
                    Zależy mi, żebyś czuła się swobodnie i spokojnie – bez stresu, bez
                    napięcia. Dużo rozmawiam, dbam o komfort i robię wszystko, żeby czas
                    sesji minął szybko i w dobrej energii.
                </p>
            </div>
        </div>

    </div>
</section>

<style>
    #o-mnie {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6rem 2rem;
        background: var(--bg);
        position: relative;
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
        max-width: 860px;
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 5rem;
        animation: fadeUp 0.8s ease both;
    }

    /* ── Name + subtitle ──────────────────────────────── */
    h3 {
        font-family: var(--font-display);
        font-size: clamp(1.2rem, 2.5vw, 1.8rem);
        font-weight: 400;
        letter-spacing: 0.04em;
        line-height: 1.3;
        color: var(--ink2);
        margin-top: 0.4rem;
    }
    h3 em {
        font-style: italic;
        color: var(--accent);
    }

    /* ── Artist block ──────────────────────────────────── */
    .artist-block {
        display: grid;
        grid-template-columns: 1fr 1.4fr;
        gap: 4rem;
        align-items: start;
    }

    /* ── Portrait + stucco frame ───────────────────────── */
    .portrait {
        aspect-ratio: 3/4;
        background: linear-gradient(
            135deg,
            rgba(214, 9, 5, 0.08),
            rgba(255, 218, 227, 0.03)
        );
        border: 1px solid rgba(214, 9, 5, 0.3);
        box-shadow:
            inset 0 0 0 5px rgba(10, 8, 8, 0.6),
            inset 0 0 0 7px rgba(214, 9, 5, 0.12),
            0 10px 40px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
    }
    .portrait::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(
            135deg,
            transparent 55%,
            rgba(214, 9, 5, 0.05)
        );
    }
    .portrait img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center 30%;
    }

    /* Stucco corner ornaments */
    .stucco-corners {
        position: absolute;
        inset: 10px;
        pointer-events: none;
        z-index: 2;
    }
    .stucco-corners span {
        position: absolute;
        width: 22px;
        height: 22px;
        border-color: rgba(214, 9, 5, 0.45);
        border-style: solid;
    }
    /* top-left */
    .stucco-corners span:nth-child(1) {
        top: 0; left: 0;
        border-width: 1.5px 0 0 1.5px;
    }
    /* top-right */
    .stucco-corners span:nth-child(2) {
        top: 0; right: 0;
        border-width: 1.5px 1.5px 0 0;
    }
    /* bottom-left */
    .stucco-corners span:nth-child(3) {
        bottom: 0; left: 0;
        border-width: 0 0 1.5px 1.5px;
    }
    /* bottom-right */
    .stucco-corners span:nth-child(4) {
        bottom: 0; right: 0;
        border-width: 0 1.5px 1.5px 0;
    }

    /* ── Text block ────────────────────────────────────── */
    .text-block {
        display: flex;
        flex-direction: column;
    }

    .mt {
        margin-top: 1.2rem;
    }

    @media (max-width: 680px) {
        .artist-block {
            grid-template-columns: 1fr;
            direction: ltr;
        }
        /* Portret zostaje na mobile — ograniczony szerokością i wyśrodkowany */
        .portrait {
            max-width: 260px;
            width: 100%;
            margin: 0 auto 2.5rem;
        }
    }
</style>
