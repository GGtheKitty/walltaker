class NodeLinkEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      graph = NodeBrowserBackend.event_graph(self) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?

      owner = graph ? graph.find(User, user_id) : User.active.find_by(id: user_id)
      owner = nil if owner&.deleted_at
      if owner
        Rails.cache.delete("v1/user-api/#{owner.username}/online-links/as-anon")
        Rails.cache.delete("v1/user-api/#{owner.username}/online-links/as-friend")
        Rails.cache.delete('v2/browselinks')
        if operation == 'destroy'
          $redis.del("link:#{link_id}:ws_clients")
          EmojiLinkDecoration.clear_cache
          Link.instantiate('id' => link_id, 'user_id' => user_id).broadcast_remove
          if NodeRealtime.enabled?
            NodeRealtime.enqueue("link:#{link_id}")
          else
            ActionCable.server.broadcast("Link::#{link_id}", { success: false, why: "Link #{link_id} does not exist." })
          end
          %w[image text].each do |kind|
            Turbo::StreamsChannel.broadcast_update_to "link_preview_#{link_id}_#{kind}", target: "preview_#{kind}", html: ''
          end
          Turbo::StreamsChannel.broadcast_replace_to 'dashboard_users_viewing_links', target: 'users_viewing_links',
                                                     partial: 'dashboard/users_viewing_links', locals: { users_viewing_links: NodeDiscoveryBackend.enabled? ? NodeDiscoveryBackend.viewing_users : User.where.not(viewing_link_id: nil) }
        elsif (link = graph ? graph.find(Link, link_id) : Link.find_by(id: link_id))
          link.broadcast_link_page_updates(raise_on_error: true)
          link.broadcast_api_update
        end
        NodeDiscoveryBackend.broadcast_recent_posts if NodeDiscoveryBackend.enabled?
        User.broadcast_api_update(owner)
      end
      update!(delivered_at: Time.current)
    end
  end
end
