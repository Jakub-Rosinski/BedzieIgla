<script>
    import Hero from "$lib/components/Hero.svelte";
    import OmniSection from "$lib/components/OmniSection.svelte";
    import GaleriaSection from "$lib/components/GaleriaSection.svelte";
    import KontaktSection from "$lib/components/KontaktSection.svelte";

    /** @type {import('./$types').PageData} */
    export let data;

    // Dane strukturalne (schema.org) dla Google. Budowane jako obiekt i serializowane
    // przez JSON.stringify — ręcznie sklejany JSON jedną literówką unieważnia cały blok.
    // Bez aggregateRating: Google zabrania oznaczania ocen, których nie ma na stronie,
    // i "opinii o sobie" w danych firmy lokalnej (#56). Opinie żyją w wizytówce Google.
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "TattooParlor",
        "@id": "https://bedzieigla.pl/#studio",
        name: "Będzie Igła!",
        alternateName: "Będzie Igła! — Gosia Wiśniewska Tattoo",
        description:
            "Studio tatuażu prowadzone przez Gosię Wiśniewską — artystkę z wykształceniem plastycznym i licencjatem ASP w Łodzi. Tatuaże artystyczne w różnych stylach, indywidualne projekty dopasowane do osoby.",
        url: "https://bedzieigla.pl",
        telephone: "+48531269735",
        image: ["https://bedzieigla.pl/logo.png", "https://bedzieigla.pl/gosia-photo.jpg"],
        priceRange: "150–1400 PLN",
        currenciesAccepted: "PLN",
        address: {
            "@type": "PostalAddress",
            streetAddress: "ul. Zawiszy Czarnego 22",
            addressLocality: "Gliwice",
            addressRegion: "Śląskie",
            addressCountry: "PL",
        },
        geo: {
            "@type": "GeoCoordinates",
            latitude: 50.2892389,
            longitude: 18.6506629,
        },
        hasMap: "https://www.google.com/maps?q=50.2892389,18.6506629",
        openingHoursSpecification: [
            {
                "@type": "OpeningHoursSpecification",
                dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
                opens: "10:00",
                closes: "18:00",
            },
        ],
        employee: {
            "@type": "Person",
            name: "Gosia Wiśniewska",
            jobTitle: "Tatuatorka",
            image: "https://bedzieigla.pl/gosia-photo.jpg",
            alumniOf: [
                { "@type": "EducationalOrganization", name: "Akademia Sztuk Pięknych w Łodzi" },
                { "@type": "EducationalOrganization", name: "Liceum Plastyczne w Kielcach" },
            ],
        },
        sameAs: [
            "https://www.facebook.com/Gosia.bedzie.igla.tattoo",
            "https://www.instagram.com/bedzie_igla_gosia_tattoo",
            "https://www.tiktok.com/@gosiawisniewskatattoo",
        ],
        contactPoint: {
            "@type": "ContactPoint",
            telephone: "+48531269735",
            contactType: "reservations",
            availableLanguage: "Polish",
        },
    };

    // `<` zamieniony na \u003c, żeby żaden tekst nie mógł zamknąć tagu <script>.
    const jsonLdScript =
        '<script type="application/ld+json">' +
        JSON.stringify(jsonLd).replace(/</g, "\\u003c") +
        "<\/script>";
</script>

<svelte:head>
    <title>Będzie Igła! — Gosia Wiśniewska Tattoo | Studio tatuażu Gliwice</title>
    <link rel="canonical" href="https://bedzieigla.pl/" />

    <!-- ── JSON-LD — LocalBusiness structured data ────────────────────────── -->
    {@html jsonLdScript}
</svelte:head>

<main>
    <Hero />
    <OmniSection />
    <GaleriaSection />
    <KontaktSection facebookUrl={data.facebookUrl} instagramUrl={data.instagramUrl} tiktokUrl={data.tiktokUrl} />
</main>

<style>
    main {
        position: relative;
    }
</style>
