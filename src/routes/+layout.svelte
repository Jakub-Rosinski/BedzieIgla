<script>
    import "../app.css";
    import Cursor from "$lib/components/Cursor.svelte";

    const GA4_ID = import.meta.env.VITE_GA4_ID ?? "";
</script>

<svelte:head>
    {#if GA4_ID}
        {@html `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"><\/script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA4_ID}');<\/script>`}
    {/if}
</svelte:head>

<Cursor />
<slot />
