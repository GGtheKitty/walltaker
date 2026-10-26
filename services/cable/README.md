# Node websocket gateway

This service replaces the Go gateway and listens on port 8080. Compose keeps
the service name `cable` and its existing host binding, so `/cable`, browser
clients, wallpaper clients and the TLS/Nginx proxies retain the same endpoint.
It runs on Node 24 with pinned `ws` and `redis` packages, a 64 MiB V8 heap and
128 MiB container memory limit. No Go toolchain or binary is required.

The gateway implements the deployed `actioncable-v1-json` protocol: welcome,
subscription confirmations/rejections, actions, unsubscription, pings and data
messages. Native clients without a subprotocol are accepted too. It does not
advertise AnyCable's optional extended/binary/history/resume protocols, which
the site's existing clients do not use.

Channel policy stays in the existing Node realtime API:

- `LinkChannel`: initial/current wallpaper payload, native client identity,
  presence, and `watch_user`/`unwatch_user` audience streams.
- `WebPresenceChannel`: signed-in browser viewing state and navigation.
- `Turbo::StreamsChannel`: signed stream names and current private-channel
  authorization for cards, chat, comments, notifications and newsroom updates.

Only allowlisted request headers go to the private HMAC-authenticated RPC.
Connection state and per-subscription state come from that API; clients cannot
supply either. Commands serialize per socket and share a four-request executor.
Stream attachment happens before confirming a subscription. Unsubscription and
close remove routing immediately; cleanup uses the final state after an in-flight
command finishes. Disconnect retries are idempotent.

The Redis envelope/channel (`__anycable__`) is kept for compatibility with the
existing Node publishers. JSON objects and Turbo HTML strings retain their data
types. Invalid broadcasts are ignored. Subscriber loss closes clients with
`reconnect: true`; readiness recovers after Redis resubscription. HTTP `/up` and
`/health` report readiness without disclosing connection data.

## Liveness and bounds

- Action Cable JSON pings and native websocket pings run every 3 seconds.
- Only a valid outstanding native-ping response renews the 60-second deadline.
  Each deadline is `now + timeout`, never accumulated from earlier pongs.
- Healthy native pongs renew this socket's link/viewer leases at most once per
  30 seconds, through the existing Node authority. They preserve navigation
  ordering and the original live-client start time.
- A socket that stops answering pings closes within 60 seconds plus the bounded
  close-handshake period (1 second). Disconnect RPC removes its leases. The
  existing five-minute Redis leases remain the fallback for process/network loss.
- Text input is capped at 64 KiB, identifiers at 8 KiB, subscriptions and queued commands at 1,024 per
  connection. Initial live-card subscription bursts are accepted; sustained
  command traffic is limited to 30 per second. Global queue/identifier and
  connection limits protect the VPS. Slow consumers are disconnected instead of
  accumulating unbounded output. Outgoing messages are not truncated.
- SIGTERM/SIGINT notify clients to reconnect, drain disconnect cleanup for up to
  8 seconds and bound Redis shutdown. Compose allows a 15-second stop grace.

Ordinary browsers and websocket libraries answer native ping frames themselves.
Native clients must keep receiving websocket frames and support pong responses;
there is no new application heartbeat requirement.

## Configuration and development

`SECRET_KEY_BASE`, `REDIS_URL` and `REALTIME_RPC_URL` are required. `PORT` defaults
to 8080; `CABLE_REDIS_CHANNEL` defaults to `__anycable__`. `CABLE_HOST_PORT` controls
the localhost host binding in Compose. Private RPC and Redis URLs are fixed by
deployment configuration, never accepted from a client.

The preview mounts `src` and uses Node watch mode. Source edits reconnect sockets
as the process reloads. Dependency/Dockerfile changes trigger a capped rebuild
and replacement of this service through the preview watcher.

`npm test --prefix services/cable` runs local protocol, state, cleanup, resource
and fast liveness tests. The isolated Redis/process test is enabled with
`TEST_REDIS_URL`; the dedicated stack runs every check:

```sh
docker compose -p walltaker-cable-tests -f services/cable/test/docker/compose.yml up -d redis
docker compose -p walltaker-cable-tests -f services/cable/test/docker/compose.yml run --rm test
docker compose -p walltaker-cable-tests -f services/cable/test/docker/compose.yml down --volumes
```

`scripts/test` includes this stack. Use only disposable Redis for the integration
test: it deliberately disconnects its pub/sub client to test recovery.

Protocol references: [Action Cable messages](https://docs.anycable.io/misc/action_cable_protocol)
and [ws server API](https://github.com/websockets/ws/blob/master/doc/ws.md).
