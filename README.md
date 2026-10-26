# Walltaker — Node branch

Walltaker lets people share control of their wallpaper through e621-backed
links, clients, live updates and community pages. This branch runs the application
on Node.js 24. Ruby, Rails, Bundler, ERB and Sprockets are no longer required to
build, start, migrate, render or test the service.

The existing database, account IDs, password hashes, API keys, client API and
websocket protocols are preserved. Existing signed cookies, stream identifiers
and media tokens remain readable by Node compatibility codecs.

## Services

| Service | Responsibility |
| --- | --- |
| `node_web` | Browser routing, native JavaScript templates, forms, CSRF integration, flash, static assets and private broadcast fragments |
| `wallpaper_api` | Wallpaper/user APIs, business services, sessions, PostgreSQL access, presence, automation, SQL dashboards, mail and durable live delivery |
| `accounts` | Authentication, bcrypt worker, settings, account/profile changes and credential access |
| `migrate` | Node schema migrations, safe existing-database baseline, fresh-install seeds and isolated database role provisioning; exits after setup |
| `e621_media` | Restricted signed media proxy |
| `cable` | Node websocket gateway, using the existing realtime RPC, Action Cable JSON protocol and liveness/lease settings |
| `router` | Nginx routes browser/API/media/websocket traffic to those services and blocks private RPC URLs |
| `database`, `redis` | PostgreSQL 14 and Redis 7; persistent Docker volumes |

Private service operations use separate HMAC namespaces and independently enforce
actor, delegation, access and CSRF policy. The web service has no database
credentials. Business services use restricted PostgreSQL roles. Broadcasts use
the same native templates/assets as page loads, with transactional outbox receipts,
retry/backoff, recipient-specific chat streams and current membership checks.
There is no Rails HTTP fallback, callback worker, view compiler or generated ERB
manifest. Unknown URLs return a native 404.

## Install and run

Requirements: Docker with Compose, Git, and Node 24/npm for local tests/builds.

1. Clone `GGtheKitty/walltaker`, select the `node` branch, and create a private
   `walltaker.env` from `.env.example` (`chmod 600 walltaker.env`).
2. Set `WALLTAKER_HOST`, `WALLTAKER_URL`, a long random `SECRET_KEY_BASE`,
   PostgreSQL administrator credentials and separate random passwords for each
   `*_DB_USER`/`*_DB_PASSWORD` pair. Configure e621 identification and SMTP.
3. Run `make deploy`. This builds Node images, starts PostgreSQL/Redis, runs the
   Node migrator/provisioner, and starts the application. `make up` starts an
   already built installation; Compose waits for database setup to succeed.
4. Put the HTTP router (`WEB_HOST_PORT`, localhost port 3000 by default) behind
   your TLS proxy. Route websocket upgrades to `/cable` on the router or the
   existing localhost Node websocket listener. Keep RPC ports private.
5. On a fresh install, sign up for your own account, then explicitly grant admin
   access with `./scripts/compose run --rm migrate node admin.js --promote USERNAME`.
   `--demote` removes that role. No shared/default human admin password is seeded.

For this VPS preview use `scripts/devenv` in place of `scripts/compose`; it checks
that the branch is `node` and loads the preview override. The test site remains
at **https://devenv.playctrl.me**. Node source/template changes reload directly;
frontend/controller/CSS/image changes rebuild native assets. The systemd watcher
handles dependencies, bounded image builds, migrations and router changes.

`make stop` stops containers without deleting volumes. `make logs` follows logs.
Never remove database volumes to apply a code update.

## Database migrations and upgrades

`db/schema.sql` is a schema-only baseline; `db/baseline.json` records its expected
table/column definitions. The Node migrator validates an existing installation
and records the baseline without rewriting accounts, wallpapers, profiles,
history or other application data. A fresh installation loads that SQL and seeds
system identities, their profiles, the client catalog and newsroom singleton.
Seeds do not replace existing accounts or client configuration.

Future schema changes go in `db/migrations/YYYYMMDDHHMMSS_description.sql`.
`make migrate` applies them under a PostgreSQL advisory lock, one transaction per
file, and then provisions the service roles. Applied baseline/migration checksums
are immutable. `make check-db` checks for pending or changed migrations. Do not
edit the baseline after an installation records it; add a new migration instead.
The admin database credential is supplied only to setup/administration commands.

Historical framework-owned database tables are preserved so existing data/job
history is not dropped during cutover. The Node importer can finish supported
queued wallpaper/news jobs; no old framework worker runs. Restoring a database
backup is an operator action, never part of ordinary startup.

## Checks and review

`make test` runs the native web/media tests, watcher tests, and isolated
PostgreSQL/Redis API/account tests. It creates a separate `walltaker-node-tests`
Compose project and removes only that project's disposable volumes afterward.
Tests do not send external email. Node migration and Nginx-routing checks are
covered by their dedicated suites as well. Browser automation is optional; lightweight
HTTP and service checks are sufficient for the VPS workflow.

See [Node-only cutover verification](docs/node-only-cutover.md), the
[complete page checklist](docs/page-verification-checklist.md), and the focused
[moderation/help/Blazer checklist](docs/moderation-remaining-verification.md).
The [web service documentation](services/web/README.md) describes native routing,
asset delivery and broadcast integration. The original service/project credits
and client links remain in the site.
