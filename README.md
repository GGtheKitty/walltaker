# Walltaker

> Oh rails, how I missed you.

## What is it?

Walltaker is inspired by the [WallClaimer](https://www.wallclaimer.com/) app, which allows you to set the wallpaper of
your friend's phones. This however leads to some weird cases where people post stuff that'd be on your metaphorical
blacklist. With that in mind, I wanted it to be restricted to e621.net results, with an enforced blacklist. This keeps
you in control, but not _too much_ control.

## VPS preview

`https://devenv.playctrl.me` serves the local `node` checkout at
`/root/walltaker/repo`, including edits that have not been committed. Refresh
the page after an edit to see it. Rails reloads application code and templates;
the Node media and API services restart when their source changes. Preview assets use
`/live-assets` so old precompiled production assets do not hide CSS or JavaScript
edits. Public error handling and HTTPS remain enabled.

Use `scripts/devenv ps`, `scripts/devenv logs -f web e621_media`, or
`scripts/devenv up -d --no-deps web e621_media wallpaper_api accounts router cable` to manage the preview.
The wrapper layers `docker-compose-devenv.yml` over the main Compose file and
loads `.env.example`, optional `.env`, and `walltaker.env` in that order. It checks
that the checkout is on `node` before running Compose.

`walltaker-devenv-watch.service` handles edits that need more than source
reloading: Rails configuration, library code and migrations restart the web
service; dependency changes rebuild the relevant image; router edits are
validated before Nginx reloads. Changes are batched for a few seconds. Restarts
can briefly interrupt requests, and dependency builds take longer. New
migrations run through `db:prepare` when the web container starts.

The Docker services and watcher start again after VPS reboots. Inspect watcher
updates with `journalctl -u walltaker-devenv-watch.service -f`. To install the
watcher on a replacement VPS, copy `scripts/walltaker-devenv-watch.service` into
`/etc/systemd/system/`, run `systemctl daemon-reload`, then
`systemctl enable --now walltaker-devenv-watch.service` after starting the stack.
Run its tests with `python3 -m unittest discover -s test/scripts -p '*_test.py'`.

## Accounts and profiles (Node.js)

`ACCOUNTS_BACKEND_URL=http://accounts:3003` moves credential verification,
registration, invite redemption, usernames, password changes and resets,
API-key rotation, colour/mascot preferences and self-service account deletion to
the separate Node `accounts` service. Existing bcrypt hashes work unchanged.
New hashes use bcrypt cost 12; a worker thread and a bounded queue keep password
work separate from HTTP handling. The container has a 160 MiB memory cap and
half a CPU. Its database password is not supplied to the wallpaper services.

Node enforces active accounts, system-account protections, case-insensitive
identity uniqueness, the weekly username cooldown, current-password checks,
and delegated-account permissions. Invite redemption and signup commit together.
Self deletion preserves account data for the existing moderator recovery tools.
Deleted accounts cannot log in or expose public profiles, and are excluded from
viewer lists. With `BROWSER_BACKEND_URL` enabled, Node owns browser sessions,
CSRF and login limits, including continuity for existing Rails cookies.

Profile creation, content saves, renaming, sharing, installation, selection,
deletion, Markdown/HTML mode state, profile lookups and style lists use Node.
Every private style mutation and selection requires ownership; installation
requires an active owner's public style. Installing makes an independent copy.
Deleting an original clears attribution pointers and retains installed copies.
Deleting a selected style selects the newest remaining owned style. Style lists
return metadata without loading every style's HTML into memory.

Rails still prepares Markdown and HTML, applies `ProfileDomainFilter` and the
existing sanitizers, renders pages and iframe isolation, and supplies the
existing relationship, tracker and attribution views, backed by the Node
services below. Node
checks editor-mode consistency and commits prepared content and profile pointers
atomically. Administrative moderation and account recovery now use the Node moderation
service described below.

Password reset requests retain a neutral public response and a ten-minute
per-account cooldown. Node issues and consumes single-use reset tokens; links
expire one hour after issuance. The existing Rails mailer sends the issued token
without changing it. A durable account event retries failed email delivery;
rotated, consumed, expired or deleted-account tokens are not emailed. Delivery is
asynchronous, and a transport retry can repeat an email if sending succeeded
before its receipt was saved. All reset tests use fake email deliveries.

Mutating commands have stable request keys and keyed payload fingerprints.
Writes and `node_account_events` commit together, and replay cannot repeat a
signup, style installation, key rotation or destructive operation. Event results
exclude password hashes, passwords, API keys and reset tokens. The authenticated
Rails event adapter preserves notifications and queues Node live API updates.
Passwords and credential-bearing requests are not logged by the Node service.
Public profile data excludes credential fields; only the owner page renders its
API key through a private, self-authorized Node account read.

After `db:prepare`, provision private `ACCOUNTS_DB_USER` and
`ACCOUNTS_DB_PASSWORD`, then run `scripts/provision-accounts.sh` inside PostgreSQL
as its admin. The role can update account/profile fields and redeem invites; it
cannot set admin/system flags or credits, hard-delete users, change global
settings, or acknowledge event delivery. Node's command endpoint and Rails'
`/_internal/account-events/` adapter require separate HMAC credentials and are
blocked by the public router. The accounts service publishes no host port.

The preview mounts accounts source and runs `node --watch`; dependency changes
are rebuilt by the preview watcher. Run `npm test` in `services/accounts` for the
password, HTTP, event retry and exact watch-mode regression checks. Set
`TEST_DATABASE_URL` to a disposable PostgreSQL admin database for the isolated
transaction and permission suite (it creates `node_accounts_test` and a test
role). Ruby adapters and fake reset-email deliveries are checked with
`bundle exec ruby test/scripts/node_account_backend_test.rb` and
`bundle exec ruby test/scripts/node_account_event_test.rb`.

## Live updates and presence (Node.js)

The public `/cable` WebSocket URL and Action Cable messages stay compatible with
existing browsers and wallpaper clients. AnyCable Go carries the socket traffic;
its HTTP RPC backend is now `wallpaper_api:3002/_internal/realtime-rpc`, implemented
in Node. Rails channel classes remain available for deployments using the old
RPC configuration. No client upgrade is required.

Node handles `LinkChannel` subscriptions by ID, custom URL or `link_id`, initial
wallpaper payloads, `check`, client identity announcements, user-status watches,
unwatching and disconnects. Live link messages preserve full descriptions and
the existing `success`/`set_by` fields. User broadcasts use the Node status reader
for anonymous, authenticated, friend and self audiences. As in the existing
channel contract, an invalid WebSocket watch API key falls back to the connection
identity; the REST status endpoint retains its invalid-key precedence.

`Turbo::StreamsChannel` authorization verifies the actual Rails JSON/HMAC stream
signature in Node. Unsigned or modified tokens are rejected. Native clients
without browser cookies can use their own origins; cookie-bearing connections
must use the site origin or omit the origin as native clients do. Node resolves
native sessions and legacy signed/encrypted cookies directly when connecting.
The realtime database role cannot read password digests or stored API keys.

Node writes polling heartbeats and maintains `link:<id>:ws_client_leases`
Redis sorted sets. Subscriptions have separate members, so another client keeps a link
online after one disconnects. RPC retries reuse membership. The historical
`live_client_started_at` changes only on an offline-to-online transition. The
five-minute per-connection leases are renewed by native pong replies every
30 seconds. Expired members are pruned by every online-status reader; normal
unsubscribe and disconnect events remove members immediately. Native ping/pong
liveness disconnects nonresponsive sockets after approximately 60 seconds. Polling windows
remain one minute, or twenty minutes for `widgetExtension` clients.

Node also owns `WebPresenceChannel` and `users.viewing_link_id` writes. Per-user
row locks and per-connection Redis entries keep browser tabs from clearing each
other's viewer presence. Moving between links refreshes both viewer lists and
the dashboard's “Who's Browsing” panel. Browser reconnects reannounce the current
page, and navigation cancels pending presence timers.

Rails model callbacks and durable wallpaper/reaction/link events enqueue API
broadcast intent in Redis; Node builds and publishes the latest payloads. A
versioned queue coalesces replacement updates, retries failed delivery and
retains updates arriving during an earlier delivery. For browser pages, Node
invokes the protected `/_internal/realtime-render.json` adapter to render existing
Rails partials. HTML templates, comments, notification rendering and other
unmigrated features still use Rails. The public router blocks internal RPC,
rendering and legacy `/_anycable` paths.

Provision `REALTIME_DB_USER` / `REALTIME_DB_PASSWORD` privately, run
`scripts/provision-realtime.sh` as the database admin, and rerun
`scripts/provision-wallpaper-api-reader.sh` for custom-URL reads. The dedicated
presence role can update only heartbeat/client fields and viewer pointers; it
cannot change wallpapers, permissions or credentials. Compose supplies
`REALTIME_DATABASE_URL` to Node and `NODE_REALTIME_URL` to Rails. Deploy the Node
service, web service and gateway configuration together after provisioning.

The PostgreSQL/Redis suite below covers restricted grants, multiple clients and
tabs, queue retries and all four broadcast audiences. RPC tests cover stream
signatures, origin handling, channel commands and request authentication.
The lightweight Ruby bridge checks run with
`bundle exec ruby test/scripts/node_realtime_test.rb`. Tests run sequentially in
memory-capped containers. The preview API itself has a 256 MiB memory cap.

## Wallpaper updates and history (Node.js)

With `WALLPAPER_BACKEND_URL=http://wallpaper_api:3002`, wallpaper submissions,
fork jobs, lizard jobs and the bot rake tasks use Node for persistence. Rails
continues to authorize requests and enforce access restrictions; e621 searches
and selections use the Node adapter described below. The private command endpoint requires a separate HMAC credential;
it is inaccessible through the public router. Node also checks that link filter
settings still match the validated selection before changing a wallpaper.

One PostgreSQL transaction updates the wallpaper, clears the previous reaction,
inserts the `past_links` record (including e621 post ID and tags), credits the
setter, and inserts a durable `node_wallpaper_events` entry. Stable command keys
prevent the same job or command retry from duplicating history or credits. Fork
jobs inherit stable keys. Failures roll back the entire transaction. The Node
writer has a separate restricted login; the polling API's reader remains
read-only and neither login can read email addresses or API keys.

Node delivers pending events to an authenticated Rails adapter. The adapter
renders Turbo previews and dashboard/history updates, preserves newsroom
behavior, and queues client/user API updates for Node publication. Successful delivery records a receipt; failures
remain pending with exponential backoff. Deleted links are acknowledged without
publishing stale wallpaper data. Repeated replacement broadcasts are safe on
transport retries; wallpaper/history/counter writes are not repeated.

The “Past Wallpapers” page, “Wallpapers Set For Others” page and profile's recent
wallpapers now obtain records through Node, keeping the existing Rails views.
History reads are newest-first and capped at 50 (five on profile previews).
The account activity log at `/history` uses the Node activity service described
below. Link settings use the Node management service.

For a new deployment, migrate first, set private `WALLPAPER_WRITER_DB_USER` and
`WALLPAPER_WRITER_DB_PASSWORD` values, then run
`scripts/provision-wallpaper-writer.sh` as the database admin inside its container
with those variables supplied. Rerun `scripts/provision-wallpaper-api-reader.sh`
to grant history reads. Recreate `web` and `wallpaper_api` only after provisioning.
Deployments without `WALLPAPER_BACKEND_URL` retain the Rails implementation.

The isolated database suite also verifies atomic commits, rollback, concurrent
updates and retries, stale-filter rejection, history ordering, column permissions,
and notification retries. Lightweight Ruby adapter tests run with
`bundle exec ruby test/scripts/node_wallpaper_backend_test.rb`.

## Wallpaper read API (Node.js)

The router sends GET and HEAD requests for `/api/links/:id.json`,
`/api/links.json` (including `?online`), and `/api/links/:id/widget.json` to the
Node.js `wallpaper_api` service. Existing JSON fields, optional-field behavior,
description truncation, widget layouts, signed media backups, active-account
filters, public/expiry filters, and the 100-link list limit are preserved.
Lists are freshly read rather than cached for five minutes. Responses include
`X-Walltaker-Backend: node-wallpaper-api` for deployment verification.
`/links/:id.json` continues through Rails. Reaction writes and user status use
the Node endpoints described below.

Node reads PostgreSQL using `WALLPAPER_API_DB_USER` and
`WALLPAPER_API_DB_PASSWORD`, a separate login granted only the required link
and username fields. Set a random password in the private deployment environment
and run `scripts/provision-wallpaper-api-reader.sh` inside the database container
as its database admin, with these two variables supplied, after `rails db:prepare`.
Do this before routing traffic to the API on a fresh deployment. The Node pool
also uses read-only transactions. Redis supplies the existing WebSocket presence
sets and API rate limits. The login cannot directly read emails or API keys.

Individual and widget reads record polling presence directly in Node when
`REALTIME_DATABASE_URL` is configured; Node queues API and browser updates.
Legacy deployments without that URL use the authenticated Rails heartbeat
adapter. The public router blocks `/_internal/`; private adapters require HMAC
credentials derived from `SECRET_KEY_BASE`. Browser cookies do not authorize them. A heartbeat failure is
logged without discarding a valid wallpaper response. Database or Redis failures
return 503 rather than misreporting the wallpaper as missing.

The preview runs this service with `node --watch` and mounts both API source
and shared media-signing code. Dependency changes are rebuilt by the VPS watcher.
Run `npm test` in `services/wallpaper-api` for HTTP and Rails JSON contract tests.
Regenerate fixtures with `bundle exec rails runner test/scripts/generate_wallpaper_api_fixtures.rb`.
Run the real PostgreSQL/Redis suite with
`docker compose -p walltaker-wallpaper-api-test -f services/wallpaper-api/test/docker/compose.yml up --build --abort-on-container-exit --exit-code-from test`,
then clean up with the same Compose command ending in `down --volumes`.

## Reactions and user status (Node.js)

`POST /api/links/:id/response.json` and `GET /api/users/:username.json` are served
by `wallpaper_api`. Reaction clients can still send JSON, form data, or query
parameters, with `type` defaulting to `horny` and `text` to an empty string.
Only the link owner's API key authorizes the response endpoint; browser cookies
do not substitute for that key. Optional `Idempotency-Key` headers prevent
duplicate reaction effects when a client retries the same request. Browser
reaction forms use Node browser authorization and CSRF checks, then call the
private Node reaction command when `WALLPAPER_BACKEND_URL` is configured.

One transaction saves the reaction, comments, setter notification, tracker and
current pledge changes. A disgust reaction removes matching wallpaper history,
nullifies pledge references, and restores the previous wallpaper (or clears the
image when no previous wallpaper remains). The five-minute tracker limit is
preserved. Node records a durable reaction event; the authenticated Rails adapter
delivers existing Turbo/AnyCable updates, comments and notification previews.
Failed deliveries retry without repeating the database writes.

User status preserves anonymous, authenticated, friend and self fields, flair,
master/pets, public unexpired link lists, and friendship-specific online status.
Online status reads current polling and Redis presence instead of the old
seven-minute Rails cache. Private links are never added to the returned list.
API keys take precedence over cookies, including invalid keys. Node resolves
browser sessions directly, including legacy Rails signed/encrypted cookies.
Response assembly and database reads run in Node. Status responses use
`Cache-Control: no-store` and `Vary: Cookie` to prevent sharing audience-specific
responses. The existing user-status rate-limit exemption is retained.

Run migrations and both database provisioning scripts before routing these
endpoints. The reader gets public status columns, relationship columns and
execution permission on `walltaker_api_authenticate(text)`, which returns only an
active matching user ID. API keys, emails and password digests remain unreadable
to both Node logins. The reader provisioning script also installs this function
after `db:schema:load`, since Rails' Ruby schema dump cannot represent functions.
The writer gains reaction activity inserts and history deletion, but cannot edit
account credentials, permission settings, or delivery receipts. The public
router blocks private endpoints and omits access logs on API-key routes.

Regenerate the four Rails user-status fixtures with
`bundle exec rails runner test/scripts/generate_user_api_fixtures.rb`. The same
isolated PostgreSQL/Redis test command above covers audiences, authentication,
transactions, restoration, tracker limits, retries and database permissions.

## Wallpaper management (Node.js)

With `LINK_MANAGEMENT_URL=http://wallpaper_api:3002`, Node owns link creation,
settings saves, custom URLs, ability toggles, deletion, personal link lists,
client configuration exports and wizard saves. Rails retains templates and
redirects; browser sessions, CSRF and access checks use Node. The private Node
commands also recheck active ownership, active surrender/delegation, custom URL
eligibility and leash-owner permissions. Client exports retain the existing
configuration keys and defaults.

Each write uses one database transaction and a stable request key. Repeated
commands do not duplicate new links, toggle abilities twice or advance wizard
steps twice. Custom URL assignments use a shared advisory lock and uniqueness
check. Invalid settings return field errors without partial writes. Wizard
steps atomically save link settings, abilities and profile preferences; all
intro choices now submit the first step so its defaults cannot be skipped.

Deletion removes the link's comments, abilities, activity events and decoration,
clears viewer/fork references, and detaches newsroom entries. Wallpaper history
is retained with a null link reference. Durable `node_link_events` deliver
existing Turbo/AnyCable updates through an authenticated Rails adapter, including
removal events and user status refreshes; failed deliveries retry separately
from the writes. Ordinary settings and reaction submissions retain their
separate commands when a client combines both kinds of fields.

The service uses `LINK_MANAGER_DATABASE_URL`, a separate database role provisioned
by `scripts/provision-link-manager.sh` after migrations. Supply private
`LINK_MANAGER_DB_USER` and `LINK_MANAGER_DB_PASSWORD` values before recreating
the services. This role can manage link settings and their dependencies but
cannot read user credentials, change administrator flags, alter wallpapers,
delete users or acknowledge delivery receipts. The existing wallpaper writer
does not gain management permissions. Public requests cannot reach
`/_internal/links/*` or the event adapter.

Run `bundle exec ruby test/scripts/node_link_backend_test.rb` for the lightweight
Rails adapter checks. The Node management tests exercise the actual provisioning
script's grants against isolated PostgreSQL, including concurrent custom URLs,
authorization, wizard progression, deletion cleanup, rollback and retries.
The manual HTTPS workflow check is `test/scripts/node_link_browser_smoke.py`.
It requires explicit `--base-url` and `--fixture` arguments; the JSON fixture
contains a disposable `NodeMgmtCheck...` username, user ID and signed browser
cookie. It creates and removes links through normal forms with CSRF protection.

## e621 search and selection (Node.js)

With `E621_BACKEND_URL=http://wallpaper_api:3002`, the existing Rails `E621`
interface delegates query construction, upstream searches, post selection and
metadata lookups to the Node `wallpaper_api` service. Compose sets this URL for
web and bot processes and supplies Node with the existing `E621_USER_AGENT`.
Rails passes a snapshot of the link's blacklist, theme, minimum score, video
ability, kink alignment and kink tags. Node applies the same query rules,
deduplication and before/after pagination. The existing search pages, manual
post-ID submissions, post-count checks, bot selections, fork checks and kink
tag checks use this adapter. Chat post previews use its metadata cache instead
of the old permanent `cached_posts` rows; existing rows are retained.

The private POST endpoints `/_internal/e621/query`, `/search`, `/select` and
`/post` require their own HMAC credential and are blocked by the public router.
The upstream origin is fixed to `https://e621.net`, redirects are disabled, and
requests carry the configured user agent. Redis coordinates one upstream request
per second across consumers, caches ordinary results for 45 minutes and random
or empty results for one minute, and shares upstream `Retry-After` cooldowns.
Identical concurrent searches share one request in each Node process. Queue
waits, network time and response size are bounded; upstream failures are not
cached as empty successes or retried immediately.

Image-only links are filtered on both fresh results and cache hits, fixing the
old cache path that could return animated media. Post-ID selection requires the
requested ID and a usable file URL. Queued wallpaper jobs revalidate the post
against current link restrictions before saving; unavailable upstream checks
retry later. Search outages show a temporary-unavailability message, and an
unavailable query builder never produces an unfiltered external browse link.
Deployments without `E621_BACKEND_URL` retain the Rails implementation.

Regenerate query fixtures without booting Rails using
`bundle exec ruby test/scripts/generate_e621_fixtures.rb`; they exercise the
preserved query builder with fake links and upstream responses. Adapter tests
run with `bundle exec ruby test/scripts/node_e621_test.rb`. Node tests run
sequentially by default, and the isolated Compose test stack has memory and CPU
limits so verification does not compete with the preview without bounds.

## e621 media proxy (Node.js)

The fallback media endpoint `/e621-media?token=...` runs in a separate Node.js 24
service. Rails still issues signed `post_url_backup` URLs; media downloads no
longer occupy Rails workers. Existing signed URLs remain valid.

Both application Compose files include a `router` service, which listens on the
existing `RAILS_HOST_PORT`. It sends `/e621-media` to `e621_media:3001` and other
requests to `web:3000`. A host reverse proxy can keep using its existing port.
If your reverse proxy addresses containers directly, point its application
upstream at `router:8080`. Keep the separate AnyCable upstream as configured.
Forward `X-Forwarded-Proto` from the TLS terminator so Rails sees HTTPS.

Deploy the router, Node service, and Rails change together: Rails no longer
serves the media endpoint. Use your usual Compose environment files with
`docker compose up -d --build web e621_media router` (add
`-f docker-compose-app.yml` when using the split deployment). This changes which
container binds the application port, so allow a brief interruption at cutover.

The Node service needs the same `SECRET_KEY_BASE` as Rails and the same
`E621_USER_AGENT`; Compose supplies both. It has no npm dependencies, database,
or Redis connection. It only fetches signed full-size media URLs on
`https://static1.e621.net`, forwards GET/HEAD and byte ranges, streams with
backpressure, and cancels upstream downloads when clients disconnect. Its
internal health endpoint is `/up`.

For local service development, run `npm start` in `services/e621-media` with
`SECRET_KEY_BASE` and `E621_USER_AGENT` set. It listens on port 3001 by default;
use `PORT` to override it. Run `npm test` in that directory for token compatibility
and HTTP integration tests using a local upstream server. The compatibility
fixture uses a dummy key and the existing Rails 7.0 signing defaults; changes to
Rails key derivation, serializer, or signature settings must update the Node
verifier and compatibility tests together.

To smoke test the Docker routing without the database or running application,
run `docker compose -p walltaker-node-smoke -f services/e621-media/test/docker/compose.yml up --build --abort-on-container-exit --exit-code-from test`.
Clean up with `docker compose -p walltaker-node-smoke -f services/e621-media/test/docker/compose.yml down`.

## Email

Password reset emails are sent through Resend SMTP. Configure delivery with these environment variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `RESEND_API_KEY` | | Resend API key used as the SMTP password. |
| `RESEND_SMTP_ADDRESS` | `smtp.resend.com` | Override only if Resend changes hosts or you need a proxy. |
| `RESEND_SMTP_PORT` | `587` | Resend supports `25`, `465`, `587`, `2465`, and `2587`. |
| `RESEND_SMTP_USER_NAME` | `resend` | Resend's SMTP username. |
| `RESEND_SMTP_AUTHENTICATION` | `plain` | Rails ActionMailer SMTP authentication mode. |
| `RESEND_SMTP_ENABLE_STARTTLS_AUTO` | `true` | Use STARTTLS automatically for ports like `587`. |
| `WALLTAKER_MAIL_FROM` | `walltaker@<host>` | Sender address for app emails. Must be allowed by your Resend domain. |

## Clients
A client is required to set the wallpaper of a device. Here are some made by the awesome community!

#### Desktop

| Client                                                                                        | Platforms                                                                                 |
|-----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| [Chewtoy's Walltaker Engine](https://github.com/dogkisser/walltaker-engine/releases)          | Windows                                                                                   |
| [JBerliner's Walltaker.sh](https://gitlab.com/JBerliner/walltaker-client)                     | Linux                                                                                     |
| [Lycraon's Wallpaper Engine Client](https://github.com/Lycraon/Walltaker-for-WallpaperEngine) | [Wallpaper Engine](https://store.steampowered.com/app/431960/Wallpaper_Engine/) (Windows) |
| [MacOS Client](https://github.com/PawCorp/walltaker-macos/releases/latest)                    | MacOS                                                                                     |

#### Mobile

| Client                                                                                        | Platforms                                                                                 |
|-----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| [Deanskond's Automate Client](https://github.com/Deanskond/walltaker_automate)                | [Automate App](https://llamalab.com/automate/) (Android)                                  |
| [Gios' Client](https://github.com/gios2/Walltaker-Changer/releases/latest)                    | Android                                                                                   |
| [iOS Widget](https://github.com/PawCorp/walltaker/blob/main/ios.md#ios-widget)                | iOS                                                                                       |

## API Guide
_Make your own client!_

You can make your own Walltaker client! A user should be able to supply any link ID, that you can then use to pull down
the latest wallpaper for that instance. I suggest you poll the endpoint ~10 seconds and cache the last post url, so you
can skip downloading if it hasn't changed since the last one.

---

### GET `https://<your-walltaker-host>/api/links/[id].json`

🔓 No API key required

Get the current post details for a given link.

#### Response:
```json
{
  "id": 1, // The ID, you already know this
  "expires": "2025-03-05T00:00:00.000Z", // Expiry timestamp, will be inaccessible after this time
  "username": "gray", // The user this refers to, queryable at the /api/user/[username] endpoint.
  "terms": "I'm trying out something new, break this please! :)", // Open text field for user to describe terms of posting
  "blacklist": "feet blood", // e621 style blacklist
  "post_url": "https://static1.e621.net/data/5d/87/5d87428c4839b0dc7d585b87a25af61a.png", // Full size post image
  "post_thumbnail_url": "https://static1.e621.net/data/preview/5d/87/5d87428c4839b0dc7d585b87a25af61a.jpg", // Thumnail size post image
  "post_description": "", // E621 post description
  "created_at": "2022-03-08T01:01:50.142Z", // Timestamp of link creation
  "updated_at": "2022-03-13T21:39:01.828Z", // Timestamp of last update from the server (should be close to current time UTC, unless something went wrong)
  "set_by": "name", // the username of the user who set the wallpaper (or null if anon)
  "response_type": "horny", // response type used, "horny" | "disgust" | "came", see chart below
  "response_text": "HUFF wow", // response text used
  "online": true // if this link has been pinged recently
}
```

---

### POST `https://<your-walltaker-host>/api/links/[id]/response.json`

🔑 Requires user's API Key

Set a response for a given link. There are 3 kinds of responses.

| `type`      | Shown In UI as | Effect                                                                                |
|-------------|----------------|---------------------------------------------------------------------------------------|
| `"horny"`   | Love it        | User who set wallpaper gets notification, response `text` displayed on link in webapp |
| `"disgust"` | Hate it        | User who set wallpaper gets notification, wallpaper rolled back to previous image     |
| `"came"`    | Came           | User who set wallpaper gets notification, response `text` displayed on link in webapp |

⚠️ I suggest re-pinging the link after sending a `"disgust"` response, so you can reset the user's wallpaper to the previous version as soon as possible.

#### Request:
The body must be a valid JSON string, like shown below

```http request
POST https://<your-walltaker-host>/api/links/[id]/response.json HTTP/1.1
Content-Type: application/json;
{
  "api_key": "23unFe3i",  // User's API key, always 8 characters long, REQUIRED
  "type": "horny",        // "horny" | "disgust" | "came", horny will be used if not supplied
  "text": "mmph nice"    // User's supplied text, an empty string will be used if not supplied
}
```

#### Response:
```json
{
  ... see link response ...
}
```

---

### GET `https://<your-walltaker-host>/api/users/[username].json?api_key=xxxxxxxx`

🔓/🔐 API key required for some, but not all data

Get details about this user's status such as if they're online, a friend, or the currently authenticated user for a given session.

ℹ️ To ensure this query is processed quickly, `set_by` has been excluded from the links array.

#### Response:
```json

{
  "username": "apple", // The user's name
  "id": 24, // The user's internal ID
  "set_count": 540, // How many wallpapers this user has set for others
  "online": true, // If the user is online, meaning they have pinged a link recently
  "links": [ // Public links owned by this user, both online and offline.
    ... see link response ...
  ],
  "authenticated": true, // If this request was authenticated with a api_key successfully
  "friend": true, // 🔐 If they are a friend of this api_key's user, requires api_key param.
  "self": false // 🔐 If they are logged in as this api_key's user, requires api_key param.
}
```

### Node social and community backend

The `node` branch also handles friendships and requests, private/group messages
(including e621 attachments), notification reads and dismissals, wallpaper
comments and their activity history, leashes/flair, account surrender, profile
interests/stars, interest-based link discovery, leaderboards, and scoop
submission/queue selection in Node. Existing pages retain their URLs, forms
and Turbo HTML rendering; browser sessions and CSRF use Node.
Newsroom scheduling and animation timing use the Node automation worker below;
Rails renders its existing templates. Survey tables are legacy data; this
branch has no active survey routes, controllers or models.

`SOCIAL_BACKEND_URL=http://wallpaper_api:3002` enables the Rails bridge. The
existing resource-capped Node API process uses a separate `SOCIAL_DATABASE_URL`
pool (two connections); this does not add another service to the VPS. Configure
`SOCIAL_DB_USER` and a private `SOCIAL_DB_PASSWORD`, run `rails db:prepare`, then
run `scripts/provision-social.sh` inside PostgreSQL as its administrator with
those variables. The role cannot read emails, password hashes, reset tokens or
API keys, edit link/user permissions, or acknowledge its own delivery receipts.
Both Compose variants supply these settings. Internal commands and event routes
require separate HMAC credentials and remain inaccessible through the public
router.

Writes and associated notifications/history commit with `node_social_events`.
Request keys prevent duplicate writes; mismatched retries fail with 409. A
bounded delivery worker retries failed HTML/live updates independently, and
Rails records the receipt only after delivery. Message streams use membership
IDs bound to the authenticated viewer. Removing a participant stops delivery to
their old stream, even on an open socket; rejoining issues a new membership ID.
Only participants can alter friendships/threads, only a leash's owner can change
its flair or release it, and scoop edits/deletions require ownership and an
unpublished scoop. Delegation checks consent, the confirmed pair, expiry and
current login state on every command.

Social integration tests exercise the production grants against isolated
PostgreSQL, races, replay/rollback, private thread cursors, membership removal,
comments, notification ownership, community visibility, scoop limits and
surrender revocation. Run Node tests sequentially with the existing
`services/wallpaper-api/test/docker/compose.yml` stack; cap memory on this VPS.
The standalone Ruby adapter/delivery tests are
`test/scripts/node_social_backend_test.rb` and
`test/scripts/node_social_event_test.rb`; they do not boot Rails.

### Node homepage, Browse and site search

`DISCOVERY_BACKEND_URL=http://wallpaper_api:3002` moves the homepage data,
Browse selection, Woogle site search and similar-link suggestions into the
existing Node API service. Rails retains the URLs, templates, forms and Turbo
HTML rendering. This is independent of the e621 search service.

Set private `DISCOVERY_DB_USER`/`DISCOVERY_DB_PASSWORD` credentials and run
`scripts/provision-discovery.sh` as the PostgreSQL administrator. Compose gives
Node a separate `DISCOVERY_DATABASE_URL` pool, limited to two read-only
connections and five-second statements. This role cannot read emails, API keys,
password hashes or reset tokens and has no write grants. Private HTTP requests
use the separate `walltaker:discovery:commands:v1` HMAC credential; the public
router blocks these internal routes. Migrated page responses carry
`X-Walltaker-Discovery: node` for deployment verification.

Browse retains the 18-card attention ranking (latest change minus six seconds
per setter credit), three recent-account recommendations, one-minute polling,
twenty-minute widget grace and live WebSocket presence. Duplicate latest history
timestamps produce one card. Every request selects eligible links again, so no
cached result IDs can keep a private, expired, deleted-owner or disconnected
link visible. The old Browse cache warmer becomes a no-op when Node is enabled.
Similar links prefer online matching themes, shared interests, other online
links, then eligible offline links.

Woogle searches link text/theme/custom URLs/reactions/descriptions and owner
usernames/bios using PostgreSQL English stemming, OR and prefix matching.
Bios come from the selected profile (or the first owned profile/legacy bio when
no selection exists); other saved private styles are excluded.
Blacklist exclusion uses whole lexemes. `!interest` selectors match owner
interests or link themes, and both selectors and the online filter survive
pagination. Results are deterministic, five per page, with accurate totals even
past the final page. Empty searches return no results; oversized/invalid queries
and pages are rejected before expensive work.

Authenticated dashboard reads include personal counts, recent public wallpapers,
active viewers of public links, the newest active account, recent scoops, online
counts and UTC daily statistics. Anonymous homepages receive the client/app
catalogue only. Only anonymous aggregate totals and the eight-day chart are
cached (30 seconds); personal totals and visibility-sensitive feeds are always
queried again. Live recent-post and viewer broadcasts use the same Node scopes
as initial page loads. Rails receives bounded associated records for card
rendering rather than selecting/ranking the results again.

The discovery PostgreSQL/Redis tests exercise actual deployment grants,
ranking, duplicate history, privacy/presence changes, stemming, prefix/blacklist
semantics, Unicode, selectors, pagination and UTC midnight. The standalone Ruby
adapter tests also verify the presentation records and preloaded associations.


### Node tracker and NNN pledges

`TRACKER_BACKEND_URL=http://wallpaper_api:3002` enables Node for the standalone
`/nut` tracker, per-user histories, logging/editing/deleting entries, credit
suggestions and notifications, profile statistics, and NNN pledge signing,
failure and yearly history. Dashboard/profile pledge status also comes from
Node. Rails retains templates, Turbo frames and live notification rendering;
browser sessions and CSRF use Node. Responses carry `X-Walltaker-Tracker: node`.

Configure private `TRACKER_DB_USER`/`TRACKER_DB_PASSWORD`, run `rails db:prepare`,
then run `scripts/provision-tracker.sh` as the PostgreSQL administrator. Both
Compose variants configure a separate `TRACKER_DATABASE_URL` pool with two
connections. This role cannot read account credentials, change identities or
relationships, delete pledges, or acknowledge its own outbox events. Private
commands use the `walltaker:tracker:commands:v1` HMAC credential. The public
router blocks command and delivery routes.

Entry writes, credit notifications, permanent pledge failure and
`node_tracker_events` commit atomically. Request keys make retries idempotent;
conflicting content returns 409. Manual logging and came reactions lock the same
owner row before checking the five-minute cooldown. Edits change only rating
(1–5) and ruined status, without applying the creation cooldown. Deletion does
not undo a failed pledge. Active delegated sessions must still have consent, a
confirmed friendship, a live controller and a valid current session proof.

Tracker history is newest first, 100 entries per page with previous/next links.
Profile charts retain UTC midnight seven days ago through today, including zero
counts, and the existing attribution totals. NNN operations obey the site
setting, require an exact username signature, select the current year on the
server and enforce one pledge per user/year. History retains old years and
wallpaper previews; repeated failure cannot overwrite the original failure time.

Run the sequential Node PostgreSQL/HTTP tests with the existing memory-capped
disposable test stack. Standalone Ruby bridge and delivery checks are
`test/scripts/node_tracker_backend_test.rb` and
`test/scripts/node_tracker_event_test.rb`; neither boots Rails.

### Node moderation and administration

`MODERATION_BACKEND_URL=http://wallpaper_api:3002` moves application moderation
into Node: report submission/evidence and queues, ticket closing, account
lookup/edit/recovery/assumption, deleted-account restoration and permanent purge,
quarantine and IP bans, recent events, invites and site toggles, emoji links,
user icons, wallpaper-client management/order, profile-domain review and
scrubbing, System/Activity analytics, and mascot staff browsing. Rails retains
the existing URLs, page and Turbo rendering, and the HTML/Markdown parser.
Browser sessions and CSRF use Node. Account assumption now requires POST with CSRF.
The embedded Blazer SQL console remains a Rails plugin; its administrator access
check also delegates to Node.

Configure private `MODERATION_DB_USER`/`MODERATION_DB_PASSWORD`, migrate, then run
`scripts/provision-moderation.sh` as the PostgreSQL administrator. Both Compose
variants supply a separate `MODERATION_DATABASE_URL` pool with two connections,
three-second lock timeouts and fifteen-second statement timeouts inside the
existing capped Node process. It can administer the required tables and issue
recovery tokens, but cannot read password hashes/API keys, promote users, change
system-account flags, or acknowledge its own event receipts. Commands use the
separate `walltaker:moderation:commands:v1` HMAC credential and are blocked by the
public router. Admin responses carry `X-Walltaker-Moderation: node` and no-store.

Every administrative read/write checks the current active administrator in
PostgreSQL. Delegated sessions are denied, including on replay. Mascot staff
access is limited to the established staff identities. Normal users can submit
reports only for visible targets; Node captures snapshots and only admins can
read them. Administrative writes commit with `node_moderation_events` audit and
live-update intent; retries cannot duplicate actions or toggles, and payload
mismatches return 409. Audits retain IDs and operation results, rather than
password recovery tokens or complete account/profile snapshots.

Account edits enforce identity uniqueness and immutable system usernames, while
allowing moderators to bypass the normal rename cooldown. The edit form lists
only supported fields and excludes credentials. Profile edits update the actual
selected/owned profile. Admin recovery now sets the expiry timestamp expected by
the Node accounts service. Links expire after one hour and are single-use;
issued tokens appear only in the protected POST result, not a redirect URL or
stored audit result. Assumption rotates the Node browser session and CSRF cookie.

Permanent purge requires a deleted, non-system account and runs atomically. It
removes dependent links, profiles, conversations authored by the account,
relationships, tracker data, survey responses/owned surveys and old presentation
outboxes. Shared profile/link pointers, retained wallpaper history and invite
attribution are detached safely. Failures roll back the whole purge. Deleting a
reported link uses a dedicated admin action and preserves the report snapshot.

Domain policy lookup/telemetry and review decisions use Node. The existing Rails
parser prepares filtered HTML/Markdown; Node persists scrubbed profiles with a
compare-and-swap check so concurrent edits are not overwritten. A durable worker
processes ten profiles per receipt and saves its cursor until finished. More
specific domain decisions retain precedence. Live invalidations and restoration
refreshes are retried independently of committed administration writes.

Run `services/wallpaper-api/test/docker/compose.yml` tests sequentially with the
existing VPS memory caps. Its accounts source mount lets recovery tests consume
the issued token through the real account implementation. The moderation schema
fixture contains definitions only, including real foreign keys; no production
rows or credentials. Standalone Ruby tests are
`test/scripts/node_moderation_backend_test.rb`,
`test/scripts/node_moderation_scrub_test.rb` and
`test/scripts/node_moderation_event_test.rb`; they exercise the transport, actual
HTML/CSS/Markdown filtering and receipt retries without booting Rails.

### Node background automation

`AUTOMATION_BACKEND_URL=http://wallpaper_api:3002` moves the recurring mascot
rounds, PornBot rounds, scoop selection, delayed wallpaper forks, and the newsroom
state machine into the existing capped Node API process. Rails no longer starts
Solid Queue when this backend is enabled. The separate Ruby `pornbot_scheduler`
Compose service is removed; use `up -d --remove-orphans` when upgrading a deployment
that had it running. Browse cache warming is retired because Node discovery
selects fresh, bounded results directly.

Run the migration, configure private `AUTOMATION_DB_USER`/`AUTOMATION_DB_PASSWORD`,
then run `scripts/provision-automation.sh` as the database administrator, supplying
those variables and `WALLPAPER_WRITER_DB_USER`. Rerun
`scripts/provision-moderation.sh` to enable Node queue metrics. Recreate `web`
and `wallpaper_api` together after provisioning. The worker has a separate
two-connection database pool, no email/password/API-key access, and no direct
wallpaper/user write permission. Wallpaper commits use the existing writer role.
Both Compose variants configure the backend and its database connection.

Mascots run once per minute (four opted-in links per round, ten-minute wallpaper
cooldown). PornBot runs every `PORNBOT_INTERVAL_SECONDS` (default 600), with at
most 60 links and a 25-minute cooldown. Scoops are checked every two minutes.
Online selection includes polling, iOS widget grace and live sockets. Native
e621 selection retains blacklists, themes, minimum scores, video and kink policy,
and the shared upstream rate limiter. Active system bot accounts are required.
Consent, current history and policy are rechecked before the wallpaper commits.

`node_automation_jobs` persists delayed jobs, exclusive claims, lease heartbeats,
bounded exponential retries and completion records. Only one job executes at a
time. A stopped instance's jobs become available after the lease expires; job
keys and wallpaper receipts prevent duplicate history/counter updates. Scheduling
is serialized in PostgreSQL and resumes with one current round after downtime,
rather than replaying missed rounds. Existing failed recurring jobs remain as
historical records and are never imported. Pending `SetLinkJob`/`PushNewsJob`
entries are handed over in batches of 25, preserving their scheduled time and
original records; malformed payloads remain visible as failed Node jobs.

Wallpaper writes enqueue fork propagation and newsroom work in the same database
transaction. Fork fanout is paged at 100 links; descendants use their own current
policy. Changed parent history, detached forks, deleted owners/setters and cycles
cancel stale work. Newsroom state, scoop claims and all interview/desk delays
survive restarts. Node also selects the existing newsroom speech tones. Rails
only broadcasts the existing Turbo partials through durable authenticated event
receipts. Generation and receipt ordering prevent old retries from replacing a
newer scene. The newsroom page reads the same persisted state through Node.

Private `/_internal/automation/*` commands use the separate
`walltaker:automation:commands:v1` HMAC namespace and are blocked publicly.
`status` reports job counts and upcoming schedules; System Analytics shows the
Node queue. Legacy Rake/ActiveJob entry points forward to Node when enabled.
Without the backend URL, the Rails job implementations remain available.

Automation integration tests use the real schema, production grants and fake
upstream e621 responses. They cover races, crashes, atomic fork enqueueing,
multi-level forks/cycles, single-use scoop claims, delayed scenes and legacy
handoff. Standalone Ruby tests are `test/scripts/node_automation_backend_test.rb`
and `test/scripts/node_automation_event_test.rb`.

### Node activity history and analytics

`ACTIVITY_BACKEND_URL=http://wallpaper_api:3002` moves personal `/history`
selection, browser activity writes, visit/event storage and the System/Activity
analytics entry points into Node. The existing history layout still groups the
newest 170 events by visit, including events without a visit and delegated-user
attribution. Node supplies the associated card data. Links that have become
private, expired or unavailable are hidden unless the viewer still has access.
History and analytics responses are private and carry `X-Walltaker-Activity: node`.

Ahoy remains the browser integration for its existing visit/visitor cookies,
four-hour visit duration, user-agent metadata and bot exclusion. Its database
store delegates visit lookup/creation, anonymous-visit authentication and event
persistence to Node. Existing visit IDs and analytics tables remain in use;
old data is available immediately. Switching accounts preserves the visit's
original user while new events identify the current account. API, internal RPC
and health-check traffic is excluded. Geocoding remains disabled.

Run the migration, configure private `ACTIVITY_DB_USER`/`ACTIVITY_DB_PASSWORD`,
then run `scripts/provision-activity.sh` as PostgreSQL's administrator with those
variables, `WALLPAPER_WRITER_DB_USER` and `SOCIAL_DB_USER`. Rerun
`scripts/provision-moderation.sh` for purge cleanup. Both Compose variants supply
a separate two-connection `ACTIVITY_DATABASE_URL` pool with ten-second statement
timeouts. The migration adds concurrent indexes for history ordering and
visit/event time ranges. Recreate `web` and `wallpaper_api` after provisioning.

The role can insert activity and analytics records and bind anonymous visits,
but cannot read email addresses, password hashes or API keys, change account
permissions, rewrite history or delete data. Private commands use the distinct
`walltaker:activity:commands:v1` HMAC credential and are blocked by the public
router. Visit lookups and associations require matching visit/visitor tokens.
Current-IP bans still apply with missing, malformed or old visit cookies.
Event properties are bounded and credential keys/URL credentials are filtered;
Rails models and exceptions are never serialized wholesale into events.

`node_activity_receipts` stores command digests and record IDs so retries cannot
duplicate history or events. Successful browser wallpaper activity commits in
the wallpaper transaction; failed updates leave no success record. Comment
activity shares the social transaction. Delegated identities are derived from
current consent and friendship records. Purging an account removes its activity
receipts too. Existing Node analytics calculations are shared by moderation and
the activity service, preserving counters, online-client rules and UTC charts.

The activity integration tests use the real schema and production grants to
exercise attribution, privacy, races, rollback and analytics. Standalone Ruby
tests `test/scripts/node_activity_backend_test.rb` and
`test/scripts/node_activity_store_test.rb` verify rendering associations and the
actual Ahoy tracker against the Node adapter without booting Rails. Deployments
without `ACTIVITY_BACKEND_URL` retain the Rails storage and history paths.


### Node browser reads and sessions

`BROWSER_BACKEND_URL=http://wallpaper_api:3002` moves the remaining normal-site
browser reads and authentication into Node. Page controllers, template
associations and live-update adapters receive explicit loaded render graphs.
Those Rails objects are read-only and reject lazy association loading. Existing
pages originally retained Rails rendering; the rendering/delivery migration
below moves template execution and receipt locking into Node. Blazer remains a
separate Rails SQL administration plugin, and Rails keeps schema migrations.

New logins use opaque `walltaker_session` cookies with only SHA-256 digests stored
in `node_browser_sessions`. Cookies are HttpOnly, SameSite=Lax and Secure over
HTTPS; remembered logins expire after 14 days, and ordinary browser sessions have
a 14-day server maximum. Login, logout, signup, admin assumption and delegation
rotate credentials. Logout revokes legacy credentials associated with an imported
session; account deletion and reset completion revoke stored sessions. Existing
Rails JSON signed/encrypted cookies, including signed-null delegation cookies,
are verified natively and imported without requiring a new login. The existing
Rails session cookie remains for flash messages, without holding new auth state.
API identity and WebSocket connections resolve sessions directly in Node.

Node owns masked CSRF tokens, origin checks and request/login/reset limits in
Redis. Existing Rails raw, global and per-form CSRF tokens remain valid during
transition. Delegation checks current consent, friendship, expiry, controller
activity and logged-in state. Current account roles and IP bans are rechecked.

Migrate, provision private `BROWSER_DB_USER`/`BROWSER_DB_PASSWORD`, then run
`scripts/provision-browser.sh` as PostgreSQL administrator. Rerun the accounts
and moderation provisioning scripts for session revocation grants, and the
social provisioning script for interest-validation status updates. Both Compose
variants configure the browser backend and separate two-connection
`BROWSER_DATABASE_URL` pool. Its role cannot read email, password/reset fields or
stored API keys, modify business records, or acknowledge rendering receipts.
Self-only private account fields and validated reset-email deliveries use the
separate accounts service. Browser RPC uses `walltaker:browser:commands:v1` HMAC
authorization and is blocked by the public router.

`X-Walltaker-Rails-Reads` audits business SELECTs on normal browser responses;
live verification covered public/authenticated pages, administration, mutations,
both legacy login types, signup/deletion, delegation, logout replay, API identity
and a protected WebSocket subscription. The Node browser tests exercise actual
PostgreSQL grants and Redis limits. Rails-generated cookie fixtures can be
regenerated with `test/scripts/generate_browser_cookie_fixtures.rb`; the offline
Ruby bridge/collection test is `test/scripts/node_browser_backend_test.rb`.

### Node rendering and delivery

`NODE_RENDERING_ENABLED=true`, `NODE_RENDER_ACTIVE=true` and
`NODE_NATIVE_DELIVERY=true` enable native rendering and delivery in the wallpaper
API service. Main-site HTML, JSON templates, Turbo fragments, live publications,
password-reset email rendering and SMTP delivery execute in Node. Responses from
the page renderer carry `X-Walltaker-Renderer: node`. Existing frontend assets,
DOM identifiers, forms, CSRF tokens and signed WebSocket subscriptions are retained.

The existing ERB/Jbuilder files remain the template source. The build-time script
`scripts/compile-node-views.rb` parses those trusted files, including their declared
default locals, into `services/wallpaper-api/src/rendering/views.json`. A bounded
native JavaScript interpreter and presentation helpers execute that static
manifest; requests cannot supply template code. Loaded presentation values cross
the private authenticated render RPC, with explicit envelopes distinguishing
untrusted hashes from trusted HTML. Unknown syntax/helpers fail closed.

Provision `DELIVERY_DB_USER`/`DELIVERY_DB_PASSWORD` with
`scripts/provision-delivery.sh` as the database administrator. This role locks and
acknowledges the eight existing durable outboxes, updates retry schedules and
guards newsroom generations. It cannot read account credentials or modify
business records. Publication failures leave receipts pending with bounded
backoff; effects use stable DOM targets. Email retries use deterministic message
IDs. Delivery is at least once across a process failure during external delivery.
The native flag disables the previous Rails delivery pollers in both Node services.

The test-site watcher compiles changed main-site and tracker templates without
booting a second Rails process. Node's source watcher then loads the atomic
manifest replacement. For a separate deployment, compile before building the
wallpaper API image:

```sh
scripts/devenv exec -T web bundle exec ruby scripts/compile-node-views.rb
scripts/devenv exec -T web bundle exec rails runner scripts/export-node-render-metadata.rb
scripts/devenv exec -T web bundle exec ruby scripts/update-node-render-public.rb
scripts/devenv build wallpaper_api
scripts/devenv build accounts
```

The metadata export contains public routes, model names and asset URLs only.
Browser render requests also carry current route/asset metadata from the HTTP
adapter, so recreated Rails asset builds and route changes use matching URLs.
Rails still provides HTTP/controller orchestration, profile-save content
preparation, asset compilation, schema migrations and Blazer. Compatibility
rendering/delivery paths remain available when the native flags are disabled.

The renderer, SMTP and delivery integration tests cover native forms, JSON/Turbo
responses, escaping, private RPC access, real SMTP against a local test server,
production database grants, publication retries, concurrent receipt claims,
revoked chat membership and stale newsroom scenes. No external test email is sent.
