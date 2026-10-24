class NodeReactionEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      graph = NodeBrowserBackend.event_graph(self) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?

      if (link = graph ? graph.find(Link, link_id) : Link.find_by(id: link_id))
        link.broadcast_link_page_updates(raise_on_error: true)
        link.broadcast_api_update
        User.broadcast_api_update(link.user)
        (graph ? graph.records('comments').where(id: comment_ids).order(:id) : Comment.where(id: comment_ids).order(:id)).each(&:broadcast_updates)
        (graph ? graph.find(Notification, notification_id) : Notification.find_by(id: notification_id))&.broadcast_updates
        if history_changed
          Turbo::StreamsChannel.broadcast_replace_to "link_details_#{link.id}", target: "link_details_#{link.id}",
                                                     partial: 'links/details', locals: { link: }
          if NodeDiscoveryBackend.enabled?
            NodeDiscoveryBackend.broadcast_recent_posts
          else
            Turbo::StreamsChannel.broadcast_replace_to 'dashboard_recent_posts', target: 'recent_posts',
                                                       partial: 'dashboard/recent_posts', locals: { recent_posts: PastLink.order(id: :desc).take(6) }
          end
        end
      end
      update!(delivered_at: Time.current)
    end
  end
end
