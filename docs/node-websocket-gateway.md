# Node websocket cutover

The `node` branch now runs its websocket gateway in Node. The Go gateway source,
build and deployed process are retired. Browser/application services, workers,
database setup and websocket delivery use Node; PostgreSQL, Redis and Nginx remain
infrastructure.

The host port and public `wss://devenv.playctrl.me/cable` endpoint are unchanged.
`LinkChannel`, `WebPresenceChannel`, signed Turbo subscriptions, private chat
membership and notification audiences still use the existing Node authority.
No frontend forms, wording, layout or client API URLs change in this migration.

The [gateway documentation](../services/cable/README.md) describes protocol
compatibility, bounds, deployment, native ping/pong and presence cleanup.
Its existing 3-second pings, 60-second native-pong timeout, 30-second lease
renewal and five-minute fallback leases are preserved. The gateway automatically
reconnects clients after a restart or Redis subscriber interruption.

## What to verify

- Keep `/links` or `/browse` open and change a link from another window; its card
  should update in place. A link's image, comments and details should update too.
- Send a message in `/messages/<id>` between two accounts. Check the other window
  receives the message and its notification bell updates.
- Open/close `/links/<id>` and check viewers. Several tabs/devices should retain
  their independent presence; closing one must leave the others online.
- Leave a wallpaper client open and idle; it should remain connected. Stop its
  receive loop/network connection and check that stale presence disappears.
- Check the signed-in dashboard and `/news_room/index` for live updates.
- Existing wallpaper/API clients should continue using the same websocket URL
  and JSON channel/action messages, including user-status watching.

## Verification

The 19 gateway/process tests cover JSON handshakes, initial/untruncated payloads, signed and
private stream policy, serialized state, multiple subscriptions, unsubscription,
forged-state rejection, close-during-subscribe, retrying cleanup, native pong
expiry after prior healthy pongs, quiet lease renewal, resource limits, subscriber
failure/recovery and graceful shutdown. The process integration test uses real
Redis and the existing authenticated HTTP RPC contract. Existing realtime
authority and preview-watcher suites also passed (9 tests each).

Live checks on the public TLS endpoint use disposable accounts and records.
They verify actual card/comment/notification broadcasts, normal disconnect,
renewal of a healthy link/viewer lease without resetting its start time, and
production-timeout removal of a socket that stops answering native pings while
another socket remains online. Private chat delivery, foreign subscription
rejection and authenticated user-status watching passed on the public endpoint too. Temporary data and test stacks are removed.
These are lightweight protocol/HTTP checks; no headless browser or load test runs.
