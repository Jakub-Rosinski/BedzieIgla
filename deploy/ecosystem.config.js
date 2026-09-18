// PM2 process file — run on the VPS as: pm2 start ecosystem.config.js
//
// Fork mode, single instance only. src/lib/server/rate-limit.js keeps its
// state in an in-memory Map — cluster mode would run multiple independent
// workers, each with its own Map, silently multiplying the effective
// rate limit. src/lib/server/queue.js has the same constraint for a different
// reason: several workers would pick up the same queued submission at once and
// mail it twice. Do not switch to cluster mode without moving that state to a
// shared store first (e.g. Redis or a file/SQLite-backed counter).
//
// SMTP_*/CONTACT_TO_EMAIL are intentionally NOT hardcoded here — this file
// is committed to git. They're loaded at process start from an untracked
// .env file in this same directory via `-r dotenv/config` (dotenv's preload
// hook, matching the "start" script in package.json) — never baked into git.

module.exports = {
  apps: [
    {
      name: "bedzieigla",
      script: "build/index.js",
      node_args: "-r dotenv/config",
      cwd: "/home/deploy/bedzieigla",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "127.0.0.1",
        ORIGIN: "https://bedzieigla.pl",
        BODY_SIZE_LIMIT: "25M",
        PROTOCOL_HEADER: "x-forwarded-proto",
        HOST_HEADER: "x-forwarded-host",
        ADDRESS_HEADER: "x-forwarded-for",
        // Kolejka zgłoszeń. MUSI leżeć poza build/ — deploy synchronizuje ten
        // katalog przez `rsync --delete`, co skasowałoby zgłoszenia czekające
        // na wysyłkę. Ścieżka względna rozwija się względem `cwd` powyżej.
        QUEUE_DIR: "queue",
      },
    },
  ],
};
