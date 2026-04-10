# Konfiguracja CI/CD — GitHub Actions → OVH Perso

## Jak działa pipeline

```
push do PR / gałęzi roboczej
    └─ ci.yml → check + unit + e2e

merge do main
    └─ deploy.yml → check → unit → e2e → build → deploy FTP
```

Każdy krok musi przejść, zanim uruchomi się następny. Deploy nigdy się nie wykona jeśli testy nie przejdą.

---

## Wymagane GitHub Secrets

Ustaw je w: **GitHub → repo → Settings → Secrets and variables → Actions → Secrets**

### FTP (OVH Perso)

| Secret | Przykład | Gdzie znaleźć |
|--------|----------|---------------|
| `FTP_HOST` | `ftp.cluster0XX.hosting.ovh.net` | Panel OVH → Hosting → FTP-SSH |
| `FTP_USERNAME` | `bedzie-igla` | Panel OVH → Hosting → FTP-SSH |
| `FTP_PASSWORD` | `••••••••` | Panel OVH → Hosting → FTP-SSH |
| `FTP_SERVER_DIR` | `/www/` | Katalog publiczny na serwerze OVH |

> Na OVH Perso katalog publiczny to zazwyczaj `/www/`. Sprawdź w panelu pod FTP-SSH → "Katalog główny".

### Aplikacja

| Secret | Przykład | Gdzie znaleźć |
|--------|----------|---------------|
| `VITE_WEB3FORMS_KEY` | `abc123...` | [web3forms.com](https://web3forms.com) → Dashboard |
| `VITE_S3_LIST_URL` | `https://s3.waw.perf.cloud.ovh.net/bedzie-igla` | Panel OVH → Object Storage |
| `VITE_S3_PUBLIC_URL` | `https://bedzie-igla.s3.waw.perf.cloud.ovh.net` | Panel OVH → Object Storage |
| `VITE_S3_PREFIX` | `gallery/` | Prefix folderu w buckecie S3 |

> Jeśli S3 nie jest skonfigurowany — zostaw `VITE_S3_LIST_URL` i `VITE_S3_PUBLIC_URL` puste. Galeria automatycznie przełączy się w tryb testowy (zdjęcia picsum.photos).

## Wymagane GitHub Variables (opcjonalne)

Ustaw je w: **Settings → Secrets and variables → Actions → Variables**

| Variable | Przykład | Użycie |
|----------|----------|--------|
| `SITE_URL` | `https://bedzieigla.pl` | Wyświetlany URL w zakładce Deployments |

## Środowisko `production`

Workflow deploy używa GitHub Environment o nazwie `production`. Możesz w nim ustawić:
- **Required reviewers** — ktoś musi ręcznie zatwierdzić deploy
- **Wait timer** — opóźnienie przed deployem (np. 5 min na ewentualne cofnięcie)
- **Deployment branches** — tylko `main` może deployować

Skonfiguruj w: **Settings → Environments → production**

---

## Pierwsze uruchomienie

1. Dodaj wszystkie Secrets jak powyżej
2. Wejdź na FTP i upewnij się że katalog `FTP_SERVER_DIR` istnieje
3. Zrób dowolny commit na `main` (np. `git commit --allow-empty -m "chore: trigger first deploy"`)
4. Obserwuj postęp w zakładce **Actions** na GitHubie

## Lokalny build produkcyjny (weryfikacja przed pushem)

```bash
VITE_WEB3FORMS_KEY=twoj-klucz \
VITE_S3_LIST_URL=https://... \
VITE_S3_PUBLIC_URL=https://... \
pnpm build

pnpm preview   # http://localhost:4173
```
