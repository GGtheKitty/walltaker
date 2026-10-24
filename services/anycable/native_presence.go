package node

import (
 "encoding/json"
 "time"

 "github.com/anycable/anycable-go/common"
)

// A native pong proves that this socket is responsive. Renew its application
// leases through the existing authenticated RPC, once per 30 seconds per socket.
// Standard Action Cable clients need no new application messages or SDK changes.
func (s *Session) refreshWalltakerPresence(now time.Time) {
 s.mu.Lock()
 connected := s.Connected && !s.closed
 s.mu.Unlock()
 if !connected { return }
 previous := s.presenceRefreshedAt.Load()
 if now.UnixNano()-previous < int64(30*time.Second) { return }
 for _, identifier := range s.subscriptions.Channels() {
  var subscription struct { Channel string `json:"channel"` }
  if json.Unmarshal([]byte(identifier), &subscription) != nil || (subscription.Channel != "LinkChannel" && subscription.Channel != "WebPresenceChannel") { continue }
  if !s.presenceRefreshedAt.CompareAndSwap(previous, now.UnixNano()) { return }
  err := s.executor.HandleCommand(s, &common.Message{Command:"message", Identifier:identifier, Data:`{"action":"heartbeat"}`})
  if err != nil { s.Log.Warn("presence heartbeat RPC failed", "error", err) }
  return
 }
}
