import consumer from "channels/consumer"

window.webPresenceConsumer = consumer.subscriptions.create("WebPresenceChannel", {
  connected() {
    if (this.viewedLinkId) this.perform('view_link', {link_id: this.viewedLinkId})
  },

  disconnected() {
    // The server removes this connection. Keep the desired link for reconnect.
  },

  viewLink (linkId) {
    this.viewedLinkId = linkId
    this.perform('view_link', {link_id: linkId})
  },

  leaveLink () {
    this.viewedLinkId = null
    this.perform('leave_link')
  },

  received(data) {
  }
});
