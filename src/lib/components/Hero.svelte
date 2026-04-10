<script>
    import CircularMenu from "./CircularMenu.svelte";
</script>

<section id="hero">
    <div class="glow-orb" aria-hidden="true"></div>
    <CircularMenu />
    <div class="scroll-hint" aria-hidden="true">
        <span>Przewiń</span>
    </div>
</section>

<style>
    #hero {
        position: relative;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: var(--bg);
    }

    .glow-orb {
        position: absolute;
        width: 600px;
        height: 600px;
        background: radial-gradient(
            circle,
            rgba(214, 9, 5, 0.1) 0%,
            transparent 70%
        );
        border-radius: 50%;
        pointer-events: none;
        animation: pulse 6s ease-in-out infinite;
    }

    .scroll-hint {
        position: absolute;
        bottom: 2.5rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: var(--ink2);
        font-size: 0.55rem;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        opacity: 0.5;
        animation: float 2.5s ease-in-out infinite;
    }
    .scroll-hint::after {
        content: "";
        width: 1px;
        height: 40px;
        background: linear-gradient(to bottom, var(--red), transparent);
    }
</style>
