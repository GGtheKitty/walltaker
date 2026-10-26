# Node-only cutover

The `node` branch serves **https://devenv.playctrl.me** without a Rails container.
Application code, browser delivery, background workers and schema setup use Node.
PostgreSQL/Redis and Nginx remain infrastructure. The later
[Node websocket migration](node-websocket-gateway.md) also replaces the Go gateway.
The gateway uses the established Node RPC, heartbeat/pong and presence-lease
settings; removing Rails does not extend connection lifetimes.

## What changed

- Removed Ruby controllers/models/jobs/helpers/mailers, templates, engine,
  migrations, Gemfiles, framework configuration, binstubs and obsolete deployment
  definitions. Frontend JavaScript, styles, images and media remain build inputs.
- Removed the HTTP fallback, Rails delivery callbacks, generated ERB view/route
  manifests, view evaluator, and Ruby build/watch/test commands.
- Live fragments now use the actual native browser templates. The Node API locks
  durable receipts and calls a private, bounded HMAC endpoint on `node_web` to
  render approved fragments, then publishes compatible Turbo updates. Current
  recipient/membership policy, retries and newsroom-generation guards remain.
- Native static delivery includes original public favicon/icon/robots/CSS/help
  URLs alongside content-addressed assets. Unknown URLs return local 404s.
- Browser/API/media/websocket routes go directly to Node. No router
  target or Compose service points to the removed Rails process.
- Node schema setup uses `db/schema.sql`, baseline validation, SQL migrations,
  advisory locking, transactional changes and immutable checksums. Existing
  account/content records are preserved. Fresh-install seed data and all isolated
  service grants are provisioned without Ruby. The trigram extension required by
  community search is installed by a SQL migration.

Historical framework database tables and old token/cookie formats are retained
for data/protocol compatibility. They require no Ruby interpreter or Rails
process. Application queues and scheduling are Node-owned.

## Review on the test site

The [full page checklist](page-verification-checklist.md) lists every implemented
page and access role. Focus on these complete flows after cutover:

1. Homepage, login/logout, signup, settings and API-key rotation.
2. `/links`, new/edit/show, e621 search/selection, comments, history and embeds.
3. Profiles/editors/style gallery, interests and By Kinks browsing.
4. Friends, chat/history, notifications, leashes and surrender takeover/return.
5. Tracker logging/editing, pledges and activity history.
6. `/mod_tools`, reports, lizard tools, help/guides and `/blazer`.
7. Keep two browser windows open and check live wallpapers/cards, comments,
   private chat, notifications, viewers and newsroom updates.

Existing client API and websocket URLs are unchanged. Requests to removed or
unimplemented framework-generated scaffold routes receive native 404/405 errors.

## Automated and live checks

The cutover checks cover native page/template/asset behavior, restricted database
roles, CSRF/delegation/privacy, durable delivery and retries, native fragments,
API compatibility, bcrypt, SMTP against a local fake server, media proxying,
presence leases, and the preview watcher. The database checks cover fresh setup
and role provisioning, safe adoption of an existing database, repeat execution,
concurrent migrators, SQL rollback, pending migrations and checksum protection.

Live HTTP checks use disposable accounts and records, then remove them. They
cover signup/login/settings/reset completion/deletion, profiles/styles/interests,
social/delegation, tracker/activity, administration/reports and the SQL engine.
No external reset email is requested; reset completion uses a fixture token.
Interactive layout/editor/chart review is manual; no headless browser is required
or run for this VPS cutover.

Verification passed: 101 native web tests, 231 API/database/delivery tests,
19 account tests, 22 media-proxy tests, 5 router tests, 9 watcher tests, and the Node schema
regression. Live websocket checks confirmed signed subscriptions, native card
replacement, comment insertion and recipient notifications. Live SQL checks also
covered cancellation and all cohort periods. All checks ran with Rails stopped;
the Rails container has been removed. Private source/database snapshots from before migration
are retained outside the checkout under `/root/walltaker/migration-backups/`.
They are not included in Docker build contexts or Git.

## Development and operations

The preview remains on `node`. Source/template changes reload in Node; assets
rebuild through esbuild. The watcher performs capped dependency/image builds,
runs Node schema/grant setup before configuration cutovers, and validates Nginx
before reload. Database setup failure prevents application startup; unknown
routes cannot silently reach another application.

Use `scripts/devenv` for this VPS and `scripts/compose` for ordinary deployments.
`make migrate` applies Node migrations/grants; `make check-db` validates checksums
and pending migrations. Do not edit an applied baseline/migration. Add a new
numbered SQL file for future schema changes. No automatic operation drops the
application's PostgreSQL/Redis volumes.
