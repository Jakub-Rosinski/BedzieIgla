<script>
    import { onMount } from "svelte";
    import { fade, scale } from "svelte/transition";

    /** Przycisk pojawia się po przewinięciu pierwszego ekranu */
    let visible = false;

    /** Ustawiane w onMount — respektuje prefers-reduced-motion */
    let smooth = true;

    onMount(() => {
        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        );
        smooth = !reduceMotion.matches;

        let ticking = false;

        function update() {
            visible = window.scrollY > window.innerHeight;
            ticking = false;
        }

        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(update);
        }

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    });

    function toTop() {
        window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    }
</script>

{#if visible}
    <button
        class="scroll-top"
        on:click={toTop}
        aria-label="Wróć na górę strony"
        title="Wróć na górę"
        in:scale={{ duration: 260, start: 0.7, opacity: 0 }}
        out:fade={{ duration: 180 }}
    >
        <span class="orbit" aria-hidden="true"></span>
        <span class="arrow" aria-hidden="true">↑</span>
    </button>
{/if}

<style>
    .scroll-top {
        position: fixed;
        right: 1.5rem;
        bottom: 1.5rem;
        width: 54px;
        height: 54px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 1px solid rgba(214, 9, 5, 0.3);
        background: rgba(10, 8, 8, 0.55);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        color: var(--ink2);
        cursor: none;
        z-index: 8000;
        box-shadow:
            inset 0 0 0 3px rgba(10, 8, 8, 0.5),
            0 6px 24px rgba(0, 0, 0, 0.45);
        transition:
            border-color 0.35s ease,
            box-shadow 0.35s ease,
            color 0.35s ease;
    }

    /* Pierścień orbitalny — nawiązanie do CircularMenu */
    .orbit {
        position: absolute;
        inset: -7px;
        border-radius: 50%;
        border: 1px dashed rgba(214, 9, 5, 0.25);
        animation: spin-slow 24s linear infinite;
        pointer-events: none;
    }

    .arrow {
        font-size: 1.1rem;
        line-height: 1;
        transition: transform 0.35s ease;
    }

    .scroll-top:hover {
        border-color: rgba(214, 9, 5, 0.65);
        color: var(--accent2);
        box-shadow:
            inset 0 0 0 3px rgba(10, 8, 8, 0.5),
            0 0 22px 4px rgba(214, 9, 5, 0.28),
            0 6px 24px rgba(0, 0, 0, 0.45);
    }
    .scroll-top:hover .arrow {
        transform: translateY(-3px);
    }

    .scroll-top:focus-visible {
        outline: 1px solid var(--accent);
        outline-offset: 4px;
    }

    @keyframes spin-slow {
        to {
            transform: rotate(360deg);
        }
    }

    /* Desktop — wariant dyskretniejszy (mniejszy, wygaszony do czasu najazdu) */
    @media (min-width: 901px) {
        .scroll-top {
            right: 2rem;
            bottom: 2rem;
            width: 44px;
            height: 44px;
            opacity: 0.55;
            transition:
                opacity 0.35s ease,
                border-color 0.35s ease,
                box-shadow 0.35s ease,
                color 0.35s ease;
        }
        .scroll-top:hover,
        .scroll-top:focus-visible {
            opacity: 1;
        }
        .arrow {
            font-size: 0.95rem;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .orbit {
            animation: none;
        }
        .scroll-top,
        .arrow {
            transition: none;
        }
    }
</style>
