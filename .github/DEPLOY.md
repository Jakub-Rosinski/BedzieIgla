# Konfiguracja CI/CD — GitHub Actions → OVH VPS

## Jak działa pipeline

```
push do PR / gałęzi roboczej
    └─ ci.yml → check + unit + e2e

merge do main
    └─ deploy.yml → check → unit → e2e → build → deploy (SSH/rsync → OVH VPS, pm2 reload)
```

Każdy krok musi przejść, zanim uruchomi się następny. Deploy nigdy się nie wykona jeśli testy nie przejdą. `main` jest chronioną gałęzią — wymaga PR z zielonymi status checkami (`gh pr create --base main` + `gh pr merge`), bezpośredni `git push` do `main` zostanie odrzucony.

---

## Wymagane GitHub Secrets

Ustaw je w: **GitHub → repo → Settings → Secrets and variables → Actions → Secrets**

### SSH (OVH VPS)

| Secret | Przykład | Gdzie znaleźć |
|--------|----------|---------------|
| `VPS_HOST` | `146.59.103.74` | Panel OVH → VPS → Adresy IP |
| `VPS_USER` | `deploy` | **Musi być dokładnie `deploy`** — `ecosystem.config.cjs` (`cwd`) i `nginx.conf.template` (`root`) hardkodują `/home/deploy/bedzieigla` |
| `VPS_SSH_KEY` | prywatny klucz ed25519 | Wygenerowany dedykowany keypair dla CI, publiczny klucz wklejony do `/home/deploy/.ssh/authorized_keys` na VPS |

> Zobacz `deploy/setup-vps.sh` dla pełnego prowizjonowania świeżego VPS-a (Nginx, PM2, Node, ufw, certbot, fail2ban) i kolejność bootstrapu TLS.

### Aplikacja (build-time, `VITE_*`)

| Secret | Przykład | Gdzie znaleźć |
|--------|----------|---------------|
| `VITE_GA4_ID` | `G-XXXXXXXXXX` | [analytics.google.com](https://analytics.google.com) → Admin → Data Streams (opcjonalny — puste = analytics wyłączone) |
| `VITE_S3_LIST_URL` | `https://s3.waw.perf.cloud.ovh.net/bedzie-igla` | Panel OVH → Object Storage |
| `VITE_S3_PUBLIC_URL` | `https://bedzie-igla.s3.waw.perf.cloud.ovh.net` | Panel OVH → Object Storage |
| `VITE_S3_PREFIX` | `gallery/` | Prefix folderu w buckecie S3 |

> Jeśli S3 nie jest skonfigurowany — zostaw `VITE_S3_LIST_URL` i `VITE_S3_PUBLIC_URL` puste. Galeria automatycznie przełączy się w tryb testowy (zdjęcia picsum.photos).

### Sekrety, które NIGDY nie trafiają do GitHub Actions

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CONTACT_TO_EMAIL` — czytane w runtime z niewersjonowanego `.env` na samym VPS (`/home/deploy/bedzieigla/.env`, `chmod 600`), nigdy z buildu ani z CI. Zobacz `deploy/.env.example`.

## Wymagane GitHub Variables (opcjonalne)

Ustaw je w: **Settings → Secrets and variables → Actions → Variables**

| Variable | Przykład | Użycie |
|----------|----------|--------|
| `SITE_URL` | `https://bedzieigla.pl` | Wyświetlany URL w środowisku `production` (zakładka Deployments) |

## Środowisko `production`

Workflow deploy używa GitHub Environment o nazwie `production`. Możesz w nim ustawić:
- **Required reviewers** — ktoś musi ręcznie zatwierdzić deploy
- **Wait timer** — opóźnienie przed deployem (np. 5 min na ewentualne cofnięcie)
- **Deployment branches** — tylko `main` może deployować

Skonfiguruj w: **Settings → Environments → production**

---

## Pierwsze uruchomienie

1. Zamów VPS-1, wskaż DNS (`bedzieigla.pl`/`www` → IP VPS-a)
2. `scp deploy/setup-vps.sh` na VPS i uruchom jako root — provisionuje Nginx, PM2, Node, ufw, certbot, fail2ban
3. Wygeneruj dedykowany keypair CI, dodaj publiczny klucz do `/home/deploy/.ssh/authorized_keys`
4. Dodaj wszystkie Secrets jak powyżej
5. Bootstrap Nginx na porcie 80, `certbot --nginx -d bedzieigla.pl -d www.bedzieigla.pl`, zainstaluj pełny `deploy/nginx.conf.template`
6. Skopiuj `deploy/ecosystem.config.cjs` na VPS, utwórz `.env` z realnymi `SMTP_*`/`CONTACT_TO_EMAIL` (`chmod 600`)
7. Otwórz PR z `main` (bezpośredni push jest zablokowany przez ochronę gałęzi), poczekaj na zielone checki, zmerguj
8. Obserwuj postęp w zakładce **Actions** na GitHubie
9. Na VPS jednorazowo: `cd ~/bedzieigla && pnpm install --prod && pm2 start ecosystem.config.cjs && pm2 save` — kolejne deploye robią już tylko `pm2 reload`

Pełny opis kroku 1–6 (w tym scenariusz interaktywny) w `scripts/vps-launch-wizard.sh`, jeśli jeszcze istnieje w repo — to jednorazowy skrypt do uruchomienia świeżego VPS-a, bezpieczny do usunięcia po pierwszym udanym starcie.

## Lokalny build produkcyjny (weryfikacja przed pushem)

```bash
VITE_S3_LIST_URL=https://... \
VITE_S3_PUBLIC_URL=https://... \
pnpm build

pnpm preview   # http://localhost:4173
```

Uwaga: `pnpm preview` podglada tylko statyczny build klienta — `/api/contact` wymaga uruchomienia `pnpm start` (adapter-node) z realnymi `SMTP_*` w `.env`.
