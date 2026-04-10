<script>
    import { onMount } from "svelte";

    let dotX = 0,
        dotY = 0;
    let ringX = 0,
        ringY = 0;
    let raf = 0;
    let visible = false;
    let hideTimer = 0;

    function resetHideTimer() {
        visible = true;
        clearTimeout(hideTimer);
        hideTimer = /** @type {number} */ (/** @type {unknown} */ (setTimeout(() => {
            visible = false;
        }, 2000)));
    }

    onMount(() => {
        const handleMove = (/** @type {MouseEvent} */ e) => {
            dotX = e.clientX;
            dotY = e.clientY;
            resetHideTimer();
        };

        document.addEventListener("mousemove", handleMove);
        document.addEventListener("click", resetHideTimer);

        const animate = () => {
            ringX += (dotX - ringX) * 0.12;
            ringY += (dotY - ringY) * 0.12;
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);

        return () => {
            document.removeEventListener("mousemove", handleMove);
            document.removeEventListener("click", resetHideTimer);
            cancelAnimationFrame(raf);
            clearTimeout(hideTimer);
        };
    });
</script>

<div class="cursor-dot" class:hidden={!visible} style="left:{dotX}px; top:{dotY}px;"></div>
<div class="cursor-ring" class:hidden={!visible} style="left:{ringX}px; top:{ringY}px;"></div>

<style>
    .cursor-dot {
        position: fixed;
        width: 10px;
        height: 10px;
        background: var(--red);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        transform: translate(-50%, -50%);
        mix-blend-mode: difference;
        transition:
            width 0.2s,
            height 0.2s,
            opacity 0.6s;
    }

    .cursor-ring {
        position: fixed;
        width: 36px;
        height: 36px;
        border: 1.5px solid var(--red);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9998;
        transform: translate(-50%, -50%);
        opacity: 0.55;
        transition:
            width 0.3s,
            height 0.3s,
            opacity 0.6s;
    }

    .hidden {
        opacity: 0 !important;
    }
</style>
