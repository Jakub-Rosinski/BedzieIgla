<script>
    import Hero from "$lib/components/Hero.svelte";
    import OmniSection from "$lib/components/OmniSection.svelte";
    import GaleriaSection from "$lib/components/GaleriaSection.svelte";
    import KontaktSection from "$lib/components/KontaktSection.svelte";

    /** @type {import('./$types').PageData} */
    export let data;
</script>

<svelte:head>
    <title>Będzie Igła! — Gosia Wiśniewska Tattoo | Studio tatuażu Gliwice</title>
    <link rel="canonical" href="https://bedzieigla.pl/" />

    <!-- ── JSON-LD — LocalBusiness structured data ────────────────────────── -->
    {@html `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TattooShop",
  "@id": "https://bedzieigla.pl/#studio",
  "name": "Będzie Igła!",
  "alternateName": "Będzie Igła! — Gosia Wiśniewska Tattoo",
  "description": "Studio tatuażu prowadzone przez Gosię Wiśniewską — artystkę z wykształceniem plastycznym i licencjatem ASP w Łodzi. Tatuaże artystyczne w różnych stylach, indywidualne projekty dopasowane do osoby.",
  "url": "https://bedzieigla.pl",
  "telephone": "+48531269735",
  "image": "https://bedzieigla.pl/logo.png",
  "priceRange": "150–1400 PLN",
  "currenciesAccepted": "PLN",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "ul. Zawiszy Czarnego 22",
    "addressLocality": "Gliwice",
    "addressRegion": "Śląskie",
    "addressCountry": "PL"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 50.2892389,
    "longitude": 18.6506629
  },
  "hasMap": "https://www.google.com/maps?q=50.2892389,18.6506629",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "10:00",
      "closes": "18:00"
    }
  ],
  "employee": {
    "@type": "Person",
    "name": "Gosia Wiśniewska",
    "jobTitle": "Tatuatorka",
    "alumniOf": [
      { "@type": "EducationalOrganization", "name": "Akademia Sztuk Pięknych w Łodzi" },
      { "@type": "EducationalOrganization", "name": "Liceum Plastyczne w Kielcach" }
    ]
  },
  "sameAs": [
    "https://www.facebook.com/Gosia.bedzie.igla.tattoo",
    "https://www.instagram.com/bedzie_igla_gosia_tattoo",
    "https://www.tiktok.com/@gosiawisniewskatattoo"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "+48531269735",
    "contactType": "reservations",
    "availableLanguage": "Polish"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "5.0",
    "reviewCount": "94",
    "bestRating": "5",
    "worstRating": "1"
  }
}
<\/script>`}
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
