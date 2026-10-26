# Node web service

`node_web` is the browser HTTP service on port 3004. All implemented browser
flows use native JavaScript templates and the native esbuild asset pipeline.
There is no fallback HTTP proxy, ERB evaluator or Rails asset/view manifest.
The web service has no database credentials; `src/backend.js` provides an explicit
allowlist of authenticated private operations on Node accounts/business services.

Routes are grouped in `src/*-routes.js`. They retain the existing URLs, form fields,
Turbo frames and visible wording. `ctx.authorize()` delegates role/surrender
checks to the session authority; mutations derive the actor from that verified
session and check CSRF before a context/session transition. URL-encoded, multipart
and JSON forms have size/complexity limits and reject prototype keys. Redirects
stay on the configured public origin. Flash cookies preserve previous sessions;
authentication uses revocable opaque Node browser cookies.

Templates use the escaping `html` tag. Only code-created fragments can contain
trusted markup. Profiles/message formatting have dedicated sanitizers. The
application bundle includes Turbo, Stimulus, Action Cable protocol support,
Chartkick/Chart.js, editor components and the reused frontend controllers under
`app/javascript`; that directory contains JavaScript, not a Rails application.
Styles/images/media under `app/assets` are ordinary build inputs.

`/node-assets/*` serves content-addressed files with ETags and immutable caching.
Audio/video support byte ranges. Old hashes remain readable during preview
rebuilds. Root public files such as `/robots.txt`, `/favicon.ico` and the existing
public CSS/help-image URLs use manifest-backed aliases with shorter caching.
Fonts and Ionicons retain their external providers.

`src/broadcasts.js` renders an explicit allowlist of fragments using the same
wallpaper, comment, message, notification, surrender and newsroom templates as
initial browser pages. Only the API delivery worker can call the HMAC-protected
`POST /_internal/broadcasts/render` endpoint. It accepts authorized record graphs,
never template syntax or user-provided trusted HTML. Nginx blocks private RPC
URLs, and direct callers must still authenticate. The API owns receipt locking,
retries, recipient selection and publication to the Node websocket gateway.

`X-Walltaker-Web: node` and `X-Walltaker-Renderer: node-native` identify native page
responses; `X-Walltaker-Assets: node` identifies native static delivery. Unknown
URLs fail locally before parsing forms or looking up a session. Health is `/up`;
backend outages return safe errors without logging credentials/form contents.

The image builds only with Node. `npm test --prefix services/web` builds assets
and runs localhost HTTP/template/asset tests. Optional browser scripts under
`test/*.mjs` require an explicitly supplied browser and disposable fixture; they
are not run by the default VPS checks. See the
[page checklist](../../docs/page-verification-checklist.md) for manual review.

The preview uses `scripts/dev.js`: template/server source reloads and frontend
assets rebuild automatically. `scripts/devenv-watch.py` performs bounded image
builds for dependency/Dockerfile changes, runs Node schema migrations, and
validates Nginx before reload. `NODE_WEB_TRUST_PROXY_HOPS=2` matches this VPS's TLS
proxy plus Nginx. Change it when deployment proxy topology changes.
