class NodeTrackerEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      graph = NodeBrowserBackend.event_graph(self) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?

      Array(effects['notifications']).uniq.each do |id|
        next unless graph ? graph.find(User, id)&.deleted_at.nil? && graph.find(User, id) : User.active.exists?(id:)
        Turbo::StreamsChannel.broadcast_replace_to "header_notifications_#{id}", target: 'header_notifications',
          partial: 'application/notifications', locals: { notifications: graph ? graph.records('notifications').where(user_id: id).order(id: :desc).limit(5) : Notification.where(user_id: id).order(id: :desc).limit(5) }
      end
      update!(delivered_at: Time.current)
    end
  end
end
