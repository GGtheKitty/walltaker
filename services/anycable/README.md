# Walltaker WebSocket liveness

This image builds the same upstream AnyCable 1.6.20 revision as the previous
`anycable/anycable-go:1.6-alpine` deployment, pinned to commit
`157a113c26e228fa52f2bf00463ebd0badb7d64b` and a source archive SHA-256.

The small patch does two things:

* Reset the native-pong deadline to `now + pong_timeout`. Upstream's accumulating
  deadline could keep a previously healthy, now stalled client around too long.
* On a successful native WebSocket pong, renew that socket's Walltaker link
  presence through the existing authenticated Rails RPC. Renewal happens at most
  once every 30 seconds per socket, even when it subscribes to multiple links.
  Other channels do not generate renewal RPCs.

Compose enables native pings alongside the existing three-second Action Cable
pings, requires a response within 60 seconds, and preserves disconnect callbacks.
Browsers and standard WebSocket libraries answer native ping control frames
without application code. Native clients must keep their WebSocket receive loop
running and support pong control frames. No new application-level heartbeat is
required from wallpaper clients.

Redis presence uses sorted sets in `link:<id>:ws_client_leases`, with one timestamp
per connection and a five-minute expiration. Reads atomically remove expired
members. Renewing one connection never refreshes another connection's timestamp.
The old seven-day sets are not interpreted as new leases. Restarting the cable
service reconnects clients into the new scheme.

`native_presence_test.go` checks bounded deadlines and renewal throttling during
the image build. `test/scripts/link_presence_test.rb` checks individual expiry,
long-lived renewal, multiple clients, disconnect idempotence and multi-link
sockets. Set `PRESENCE_TEST_REDIS_URL` to a disposable Redis server to run the same
tests against actual Redis transactions. A single Redis/AnyCable deployment is
sufficient; no extra presence worker or process is required.
