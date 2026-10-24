class NodeWallpaperEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      graph = NodeBrowserBackend.event_graph(self) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?

      link = graph ? graph.find(Link, link_id) : Link.find_by(id: link_id)
      past_link = graph ? graph.find(PastLink, past_link_id) : PastLink.find_by(id: past_link_id)
      if link && past_link
        link.broadcast_link_page_updates(raise_on_error: true)
        link.broadcast_api_update
        User.broadcast_api_update(link.user)
        User.broadcast_api_update(past_link.set_by) if past_link.set_by_id && past_link.set_by_id != link.user_id
        past_link.broadcast_updates
      end
      update!(delivered_at: Time.current)
    end
  end
end
