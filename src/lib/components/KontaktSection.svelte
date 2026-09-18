<script>
    import MapaSection from "./MapaSection.svelte";
    import {
        validate,
        isBotSubmission,
        isEmailRateLimited,
        isSessionRateLimited,
        recordSuccessfulSend,
    } from "$lib/form-utils.js";

    /** @type {string} */
    export let facebookUrl;
    /** @type {string} */
    export let instagramUrl;
    /** @type {string} */
    export let tiktokUrl;

    let name = "";
    let email = "";
    let phone = "";
    let message = "";
    let miejsce = "";
    let wielkosc = "";
    /** @type {FileList|null} */
    let inspFiles = null;

    /** @type {'idle'|'sending'|'success'|'error'} */
    let status = "idle";
    let errorMsg = "";

    // Honeypot — musi pozostać false. Boty zaznaczają ukryte checkboxy.
    let botcheck = false;

    // Czas pierwszej interakcji — do wykrywania botów po czasie wypełniania
    let firstInteractionAt = 0;

    function recordFirstInteraction() {
        if (!firstInteractionAt) firstInteractionAt = Date.now();
    }

    const MAX_FILE_SIZE_MB = 5;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    const MAX_IMG_PX = 2200;   // max dimension after resize — plenty for tattoo reference photos
    const JPEG_QUALITY = 0.85; // JPEG compression quality
    const SKIP_RESIZE_UNDER_BYTES = 1024 * 1024; // don't re-encode already-small files

    /**
     * Resizes an image file via canvas to MAX_IMG_PX/JPEG_QUALITY, returned as a File.
     * Skips re-encoding files that are already small — no artificial cap to fight anymore,
     * the server (/api/contact) sends the real file as a MIME attachment.
     * @param {File} file
     * @returns {Promise<File>}
     */
    function resizeForUpload(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objUrl);
                const longest = Math.max(img.width, img.height);
                if (file.size <= SKIP_RESIZE_UNDER_BYTES && longest <= MAX_IMG_PX) {
                    resolve(file);
                    return;
                }
                const scale = Math.min(1, MAX_IMG_PX / longest);
                const canvas = document.createElement("canvas");
                canvas.width  = Math.round(img.width  * scale);
                canvas.height = Math.round(img.height * scale);
                /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"))
                    .drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error(`Nie udało się przetworzyć pliku "${file.name}".`));
                            return;
                        }
                        resolve(new File([blob], file.name, { type: "image/jpeg" }));
                    },
                    "image/jpeg",
                    JPEG_QUALITY
                );
            };
            img.onerror = reject;
            img.src = objUrl;
        });
    }

    /**
     * Validates and resizes the selected inspiration files for upload.
     * @param {FileList} fileList
     * @returns {Promise<File[]>}
     */
    async function prepareFiles(fileList) {
        const files = Array.from(fileList);
        for (const file of files) {
            if (!file.type.startsWith("image/"))
                throw new Error(`Plik "${file.name}" nie jest obrazem.`);
            if (file.size > MAX_FILE_SIZE_BYTES)
                throw new Error(`Plik "${file.name}" przekracza ${MAX_FILE_SIZE_MB} MB.`);
        }
        return Promise.all(files.map(resizeForUpload));
    }

    // ─── Wysyłka ──────────────────────────────────────────────────────────────
    async function handleSubmit() {
        if (status === "sending") return;

        // Honeypot — bot zaznaczył ukryty checkbox
        if (botcheck) return;

        // Walidacja pól
        const validationError = validate(name, email, phone, message, miejsce, wielkosc);
        if (validationError) {
            errorMsg = validationError;
            return;
        }

        // Czas wypełniania — zbyt szybkie = bot (cicha rezygnacja)
        if (isBotSubmission(firstInteractionAt)) {
            status = "success";
            return;
        }

        // Rate limiting — per sesja
        if (isSessionRateLimited()) {
            errorMsg = "Przekroczono dzienny limit wiadomości.";
            return;
        }

        // Rate limiting — per email
        const emailCheck = isEmailRateLimited(email);
        if (emailCheck.limited) {
            errorMsg = `Przekroczono limit wysyłek. Spróbuj ponownie za ${emailCheck.mins} min.`;
            return;
        }

        status = "sending";
        errorMsg = "";

        // Walidacja i lekkie skalowanie zdjęć (pełna jakość leci na serwer jako MIME attachment)
        let preparedFiles = [];
        try {
            preparedFiles = inspFiles?.length ? await prepareFiles(inspFiles) : [];
        } catch (err) {
            status = "error";
            errorMsg = err instanceof Error ? err.message : "Błąd pliku.";
            return;
        }

        try {
            const fd = new FormData();
            fd.append("name", name.trim());
            fd.append("email", email.trim());
            fd.append("phone", phone.trim());
            fd.append("miejsce", miejsce.trim());
            fd.append("wielkosc", wielkosc.trim());
            fd.append("message", message.trim());
            fd.append("firstInteractionAt", String(firstInteractionAt));
            fd.append("botcheck", botcheck ? "1" : "");
            for (const file of preparedFiles) fd.append("inspiracje", file, file.name);

            const res = await fetch("/api/contact", { method: "POST", body: fd });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.ok) {
                recordSuccessfulSend(email);
                status = "success";
                name = "";
                email = "";
                message = "";
                phone = "";
                miejsce = "";
                wielkosc = "";
                inspFiles = null;
                firstInteractionAt = 0;
            } else if (res.status === 429) {
                status = "error";
                errorMsg = data.error || "Zbyt wiele zgłoszeń. Spróbuj ponownie za chwilę.";
            } else if (res.status === 413) {
                status = "error";
                errorMsg = "Inspiracje są za duże — spróbuj przesłać mniej plików lub mniejsze obrazy.";
            } else {
                status = "error";
                errorMsg =
                    data.error ||
                    "Nie udało się wysłać wiadomości. Spróbuj ponownie lub skontaktuj się przez social media.";
            }
        } catch {
            status = "error";
            errorMsg = "Błąd połączenia. Sprawdź internet i spróbuj ponownie.";
        }
    }

    function reset() {
        status = "idle";
        errorMsg = "";
    }

    const links = [
        {
            icon: "◎",
            label: "Instagram — @bedzieigla",
            href: instagramUrl,
        },
        {
            icon: "◈",
            label: "Facebook — Będzie Igła!",
            href: facebookUrl,
        },
        {
            icon: "◭",
            label: "TikTok — @bedzie_igla",
            href: tiktokUrl,
        },
        {
            icon: "◉",
            label: "Tel. 531 269 735",
            href: "https://wa.me/48531269735",
        },
    ];
</script>

<section id="kontakt">
    <div class="sep" aria-hidden="true"></div>
    <div class="section-inner">
        <p class="section-num">03 — Kontakt</p>
        <h2>Porozmawiajmy <em>o projekcie</em></h2>
        <div class="section-divider"></div>
        <p class="intro">
            Masz pomysł na tatuaż? Napisz — razem stworzymy coś wyjątkowego.
        </p>

        <address class="studio-address">
            <span class="studio-name">Będzie Igła! — Gosia Wiśniewska Tattoo</span>
            <span>ul. Zawiszy Czarnego 22, Gliwice</span>
            <a href="tel:+48531269735">tel. 531&nbsp;269&nbsp;735</a>
        </address>

        <ul class="contact-links" role="list">
            {#each links as link}
                <li>
                    <a
                        href={link.href}
                        class="contact-link"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <span class="icon">{link.icon}</span>
                        <span class="label">{link.label}</span>
                        <span class="arrow" aria-hidden="true">⟶</span>
                    </a>
                </li>
            {/each}
        </ul>

        <div class="form-wrapper">
            <div class="form-header">
                <span class="form-label">Wyślij wiadomość</span>
                <span class="form-deco" aria-hidden="true">✦</span>
            </div>

            {#if status === "success"}
                <div class="feedback success" role="status">
                    <span class="feedback-icon">◈</span>
                    <div>
                        <strong>Wiadomość wysłana!</strong>
                        <p>
                            Odpiszę tak szybko, jak to możliwe. Do zobaczenia
                            pod igłą!
                        </p>
                    </div>
                    <button class="btn-reset" on:click={reset}
                        >Wyślij kolejną</button
                    >
                </div>
            {:else}
                <form on:submit|preventDefault={handleSubmit} novalidate>
                    <div class="field">
                        <label for="f-name">
                            Imię i Nazwisko <span class="required" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="f-name"
                            type="text"
                            bind:value={name}
                            placeholder="np. Anna Kowalska"
                            autocomplete="name"
                            maxlength="100"
                            required
                            disabled={status === "sending"}
                            on:input={recordFirstInteraction}
                        />
                    </div>

                    <div class="field">
                        <label for="f-email">
                            Adres e-mail <span
                                class="required"
                                aria-hidden="true">*</span
                            >
                        </label>
                        <input
                            id="f-email"
                            type="email"
                            bind:value={email}
                            placeholder="twoj@email.pl"
                            autocomplete="email"
                            maxlength="254"
                            required
                            disabled={status === "sending"}
                            on:input={recordFirstInteraction}
                        />
                    </div>

                    <div class="field">
                        <label for="f-phone">
                            Numer telefonu <span class="required" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="f-phone"
                            type="tel"
                            bind:value={phone}
                            placeholder="np. 531 269 735"
                            autocomplete="tel"
                            maxlength="20"
                            required
                            disabled={status === "sending"}
                            on:input={recordFirstInteraction}
                        />
                    </div>

                    <div class="field">
                        <label for="f-miejsce">
                            Miejsce na ciele <span class="required" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="f-miejsce"
                            type="text"
                            bind:value={miejsce}
                            placeholder="np. przedramię, łopatka, kostka"
                            maxlength="200"
                            required
                            disabled={status === "sending"}
                            on:input={recordFirstInteraction}
                        />
                    </div>

                    <div class="field">
                        <label for="f-wielkosc">
                            Wielkość <span class="required" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="f-wielkosc"
                            type="text"
                            bind:value={wielkosc}
                            placeholder="np. dłoń, ok. 10×10 cm, mała"
                            maxlength="200"
                            required
                            disabled={status === "sending"}
                            on:input={recordFirstInteraction}
                        />
                    </div>

                    <div class="field">
                        <label for="f-message">
                            Opisz swój pomysł <span
                                class="required"
                                aria-hidden="true">*</span
                            >
                        </label>
                        <textarea
                            id="f-message"
                            bind:value={message}
                            placeholder="Styl, nastrój, kolory, skojarzenia — napisz, co chcesz wyrazić..."
                            rows="6"
                            maxlength="5000"
                            required
                            disabled={status === "sending"}
                            on:input={recordFirstInteraction}
                        ></textarea>
                        <span
                            class="char-count"
                            class:warn={message.length > 4500}
                        >
                            {message.length} / 5000
                        </span>
                    </div>

                    <div class="field">
                        <label for="f-inspiracje">
                            Inspiracje <span class="optional">— zdjęcia, grafiki, rysunki (max {MAX_FILE_SIZE_MB} MB / plik)</span>
                        </label>
                        <label class="file-drop" class:disabled={status === "sending"}>
                            <input
                                id="f-inspiracje"
                                type="file"
                                accept="image/*"
                                multiple
                                bind:files={inspFiles}
                                disabled={status === "sending"}
                                on:change={recordFirstInteraction}
                            />
                            <span class="file-icon">◎</span>
                            {#if inspFiles?.length}
                                <span class="file-names">
                                    {Array.from(inspFiles).map(f => f.name).join(", ")}
                                </span>
                            {:else}
                                <span class="file-placeholder">Kliknij lub przeciągnij pliki tutaj</span>
                            {/if}
                        </label>
                    </div>

                    {#if errorMsg}
                        <div class="feedback error" role="alert">
                            <span class="feedback-icon">✕</span>
                            <p>{errorMsg}</p>
                        </div>
                    {/if}

                    <!-- Honeypot — ukryte pole antyspamowe. Musi pozostać niezaznaczone. -->
                    <input
                        type="checkbox"
                        name="botcheck"
                        bind:checked={botcheck}
                        style="display:none"
                        tabindex="-1"
                        aria-hidden="true"
                        autocomplete="off"
                    />

                    <button
                        type="submit"
                        class="btn-submit"
                        disabled={status === "sending"}
                        aria-busy={status === "sending"}
                    >
                        {#if status === "sending"}
                            <span class="spinner" aria-hidden="true"></span> Wysyłanie…
                        {:else}
                            Wyślij wiadomość ⟶
                        {/if}
                    </button>

                    <p class="form-note">* Pola obowiązkowe.</p>
                </form>
            {/if}
        </div>

        <MapaSection />
    </div>
</section>

<style>
    #kontakt {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 6rem 2rem 8rem;
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
        max-width: 680px;
        width: 100%;
        animation: fadeUp 0.8s ease both;
    }
    .intro {
        margin-bottom: 2rem;
    }

    /* Adres studia (widoczny tekst + klikalny telefon) */
    .studio-address {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 2.5rem;
        font-style: normal;
        color: var(--ink2);
        font-size: 0.95rem;
        line-height: 1.5;
    }
    .studio-address .studio-name {
        font-family: var(--font-display);
        color: var(--ink);
        letter-spacing: 0.02em;
    }
    .studio-address a {
        color: var(--accent);
        width: fit-content;
        cursor: none;
    }
    .studio-address a:hover {
        text-decoration: underline;
    }

    /* Social links */
    .contact-links {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 3rem;
    }
    .contact-link {
        display: flex;
        align-items: center;
        gap: 1.2rem;
        padding: 1rem 1.5rem;
        border: 1px solid rgba(214, 9, 5, 0.18);
        color: var(--ink2);
        font-size: 0.82rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        transition:
            color 0.35s,
            border-color 0.35s,
            background 0.35s,
            padding-left 0.35s;
        position: relative;
        overflow: hidden;
        cursor: none;
    }
    .contact-link::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--red);
        transform: scaleY(0);
        transition: transform 0.35s;
        transform-origin: bottom;
    }
    .contact-link:hover {
        color: var(--pink);
        border-color: rgba(214, 9, 5, 0.5);
        background: rgba(214, 9, 5, 0.06);
        padding-left: 2rem;
    }
    .contact-link:hover::before {
        transform: scaleY(1);
    }
    .icon {
        font-size: calc(1rem + 4px);
        color: var(--red);
    }
    .label {
        flex: 1;
    }
    .arrow {
        opacity: 0;
        transform: translateX(-6px);
        transition:
            opacity 0.3s,
            transform 0.3s;
        color: var(--pink-dk);
    }
    .contact-link:hover .arrow {
        opacity: 1;
        transform: translateX(0);
    }

    /* Form wrapper */
    .form-wrapper {
        border: 1px solid rgba(214, 9, 5, 0.18);
        padding: 2.5rem;
        background: rgba(0, 0, 0, 0.25);
        position: relative;
    }
    .form-wrapper::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 60px;
        height: 3px;
        background: linear-gradient(90deg, var(--red), transparent);
    }
    .form-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 2rem;
    }
    .form-label {
        font-size: calc(0.6rem + 4px);
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: var(--red);
    }
    .form-deco {
        color: rgba(214, 9, 5, 0.25);
        font-size: 0.9rem;
    }

    /* Fields */
    form {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        position: relative;
    }
    label {
        font-size: calc(0.62rem + 4px);
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--ink2);
    }
    .optional {
        color: rgba(220, 220, 220, 0.45);
        font-size: 0.58rem;
    }
    .required {
        color: var(--red);
        margin-left: 2px;
    }
    input,
    textarea {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(214, 9, 5, 0.18);
        color: var(--ink);
        font-family: var(--font-body);
        font-size: 1rem;
        padding: 0.85rem 1rem;
        outline: none;
        resize: vertical;
        width: 100%;
        transition:
            border-color 0.3s,
            background 0.3s,
            box-shadow 0.3s;
    }
    input::placeholder,
    textarea::placeholder {
        color: rgba(220, 220, 220, 0.3);
    }
    input:focus,
    textarea:focus {
        border-color: var(--red);
        background: rgba(214, 9, 5, 0.04);
        box-shadow: 0 0 0 3px rgba(214, 9, 5, 0.08);
    }
    input:disabled,
    textarea:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .char-count {
        font-size: 0.6rem;
        letter-spacing: 0.1em;
        color: rgba(220, 220, 220, 0.35);
        text-align: right;
        transition: color 0.3s;
    }
    .char-count.warn {
        color: var(--pink-dk);
    }

    /* File input */
    .file-drop {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 1rem 1.2rem;
        background: rgba(255, 255, 255, 0.03);
        border: 1px dashed rgba(214, 9, 5, 0.3);
        color: var(--ink2);
        cursor: pointer;
        transition:
            border-color 0.3s,
            background 0.3s;
        min-height: 3.2rem;
    }
    .file-drop:not(.disabled):hover {
        border-color: rgba(214, 9, 5, 0.55);
        background: rgba(214, 9, 5, 0.04);
    }
    .file-drop.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .file-drop input[type="file"] {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
    }
    .file-icon {
        color: var(--red);
        font-size: 1rem;
        flex-shrink: 0;
    }
    .file-placeholder {
        font-size: 0.78rem;
        letter-spacing: 0.05em;
        color: rgba(220, 220, 220, 0.35);
    }
    .file-names {
        font-size: 0.75rem;
        letter-spacing: 0.04em;
        color: var(--ink2);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Feedback */
    .feedback {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        padding: 1.2rem 1.5rem;
        border: 1px solid;
        font-size: 0.9rem;
    }
    .feedback.success {
        border-color: rgba(214, 9, 5, 0.35);
        background: rgba(214, 9, 5, 0.06);
        flex-direction: column;
    }
    .feedback.success strong {
        display: block;
        color: var(--pink);
        letter-spacing: 0.05em;
        margin-bottom: 0.4rem;
    }
    .feedback.error {
        border-color: rgba(233, 153, 155, 0.35);
        background: rgba(233, 153, 155, 0.06);
        color: var(--pink-dk);
    }
    .feedback-icon {
        color: var(--red);
        font-size: 1.1rem;
        flex-shrink: 0;
        margin-top: 2px;
    }

    /* Buttons */
    .btn-submit {
        align-self: flex-start;
        background: var(--red);
        color: var(--ink);
        border: none;
        padding: 1rem 2.2rem;
        font-family: var(--font-body);
        font-size: 0.75rem;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        cursor: none;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        transition:
            background 0.3s,
            transform 0.2s,
            box-shadow 0.3s;
        position: relative;
        overflow: hidden;
    }
    .btn-submit::before {
        content: "";
        position: absolute;
        inset: 0;
        background: rgba(255, 255, 255, 0.08);
        transform: translateX(-100%);
        transition: transform 0.4s;
    }
    .btn-submit:hover::before {
        transform: translateX(0);
    }
    .btn-submit:hover {
        background: var(--red-dk);
        box-shadow: 0 8px 30px rgba(214, 9, 5, 0.35);
        transform: translateY(-1px);
    }
    .btn-submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }
    .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
    .btn-reset {
        background: none;
        border: 1px solid rgba(214, 9, 5, 0.35);
        color: var(--pink-dk);
        font-family: var(--font-body);
        font-size: 0.65rem;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        padding: 0.6rem 1.2rem;
        cursor: none;
        margin-top: 0.5rem;
        transition:
            border-color 0.3s,
            color 0.3s;
    }
    .btn-reset:hover {
        border-color: var(--red);
        color: var(--pink);
    }
    .section-num {
        font-size: calc(0.6rem + 4px);
    }
    .form-note {
        font-size: 0.6rem;
        letter-spacing: 0.08em;
        color: rgba(220, 220, 220, 0.35);
        line-height: 1.6;
        margin-top: -0.5rem;
    }

    @media (max-width: 520px) {
        .form-wrapper {
            padding: 1.5rem;
        }
        .btn-submit {
            width: 100%;
            justify-content: center;
        }
    }
</style>
