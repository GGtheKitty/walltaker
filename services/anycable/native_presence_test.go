package node

import (
 "testing"
 "time"
 "github.com/anycable/anycable-go/common"
)

type walltakerExecutor struct { calls []*common.Message }
func (e *walltakerExecutor) HandleCommand(_ *Session, msg *common.Message) error { e.calls=append(e.calls,msg);return nil }
func (e *walltakerExecutor) Disconnect(_ *Session) error { return nil }

func TestWalltakerPongDeadlineDoesNotAccumulate(t *testing.T) {
 s:=BuildSession(nil,nil);s.pongTimeout=60*time.Second
 // A previously renewed deadline must never push the next timeout further out.
 s.timers.pongDeadline=time.Now().Add(24*time.Hour).UnixNano()
 s.HandleNativePong()
 defer s.timers.Stop()
 left:=time.Until(time.Unix(0,s.timers.pongDeadline))
 if left<59*time.Second || left>61*time.Second { t.Fatalf("deadline is %s away",left) }
}
func TestWalltakerHeartbeatRenewsOneSocketOncePerInterval(t *testing.T) {
 e:=&walltakerExecutor{};s:=BuildSession(nil,nil);s.executor=e;s.Connected=true
 s.subscriptions.AddChannel(`{"channel":"Turbo::StreamsChannel"}`)
 first:=`{"channel":"LinkChannel","id":1}`;s.subscriptions.AddChannel(first)
 s.subscriptions.AddChannel(`{"channel":"LinkChannel","id":2}`)
 now:=time.Now();s.refreshWalltakerPresence(now);s.refreshWalltakerPresence(now.Add(time.Second))
 if len(e.calls)!=1 || e.calls[0].Data!=`{"action":"heartbeat"}` { t.Fatalf("expected one renewal, got %d",len(e.calls)) }
 s.refreshWalltakerPresence(now.Add(31*time.Second))
 if len(e.calls)!=2 { t.Fatal("heartbeat did not renew again") }
 s.Connected=false;s.refreshWalltakerPresence(now.Add(time.Minute))
 if len(e.calls)!=2 { t.Fatal("closed socket renewed presence") }
}
func TestWalltakerNonLinkSubscriptionsDoNotInvokeApplication(t *testing.T) {
 e:=&walltakerExecutor{};s:=BuildSession(nil,nil);s.executor=e;s.Connected=true
 s.subscriptions.AddChannel(`{"channel":"Turbo::StreamsChannel"}`)
 s.refreshWalltakerPresence(time.Now())
 if len(e.calls)!=0 { t.Fatal("unexpected renewal for unrelated channel") }
}
