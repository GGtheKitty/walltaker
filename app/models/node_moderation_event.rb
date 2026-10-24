class NodeModerationEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      graph = NodeBrowserBackend.event_graph(self) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?
      if effects['scrub']
        # Each receipt processes a bounded page. Returning 204 without marking
        # delivered keeps the next page durable without holding a Rails thread.
        return unless NodeModerationBackend.scrub_page!(self)
      end
      Array(effects['settings']).each { |key| Rails.cache.delete("site_settings/#{key}") }
      EmojiLinkDecoration.clear_cache if effects['emoji']
      Array(effects['usernames']).uniq.each { |name| User.broadcast_api_update_for_username(name) }
      Array(effects['deleted_links']).each do |id|
        $redis.del("link:#{id}:ws_clients")
        Link.instantiate('id' => id).broadcast_remove
        NodeRealtime.enqueue("link:#{id}") if NodeRealtime.enabled?
        %w[image text].each do |kind|
          Turbo::StreamsChannel.broadcast_update_to "link_preview_#{id}_#{kind}", target: "preview_#{kind}", html: ''
        end
      end
      Array(effects['surrenders']).each do |snapshot|
        surrender = graph ? graph.find(Surrender, snapshot.fetch('id')) : Surrender.new(snapshot); surrender.id = snapshot.fetch('id')
        Turbo::StreamsChannel.broadcast_replace_to surrender, target: :surrender_status,
          partial: 'layouts/surrender', locals: { surrender:, revoked: true }
      end
      Array(effects['users']).each do |id|
        (graph ? graph.records('links').where(user_id: id) : Link.unscoped.where(user_id: id)).find_each do |link|
          link.broadcast_link_page_updates(raise_on_error: true)
          link.broadcast_api_update
        end
      end
      if effects['usernames'].present? || effects['deleted_links'].present?
        Rails.cache.delete('v2/browselinks')
        NodeDiscoveryBackend.broadcast_recent_posts if NodeDiscoveryBackend.enabled?
        NodeRealtime.enqueue('dashboard-viewers:all') if NodeRealtime.enabled?
      end
      update!(delivered_at: Time.current)
    end
  end
end
