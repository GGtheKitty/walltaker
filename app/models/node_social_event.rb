class NodeSocialEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      graph = NodeBrowserBackend.event_graph(self) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?
      Array(effects['notifications']).each do |id|
        next unless graph ? graph.find(User, id)&.deleted_at.nil? && graph.find(User, id) : User.active.exists?(id:)
        Turbo::StreamsChannel.broadcast_replace_to "header_notifications_#{id}", target: 'header_notifications',
          partial: 'application/notifications', locals: { notifications: graph ? graph.records('notifications').where(user_id: id).order(id: :desc).limit(5) : Notification.where(user_id: id).order(id: :desc).limit(5) }
      end
      (graph ? graph.find(Comment, effects['comment_id']) : Comment.find_by(id: effects['comment_id']))&.broadcast_updates if effects['comment_id']
      if effects['message_id'] && (message = graph ? graph.find(Message, effects['message_id']) : Message.find_by(id: effects['message_id']))
        # Separate streams for each membership prevent removed members from
        # receiving future private messages through an already-open socket.
        message.message_thread.participants.joins(:user).where(users: { deleted_at: nil }).find_each do |participant|
          Turbo::StreamsChannel.broadcast_prepend_to "social_thread_member_#{participant.id}_#{participant.user_id}",
            target: message.message_thread, partial: 'message_thread/single_message', locals: { message: }
        end
      end
      Array(effects['users']).each do |id|
        user = graph ? graph.find(User, id) : User.active.find_by(id:)
        user = nil if user&.deleted_at
        User.broadcast_api_update(user) if user
      end
      Array(effects['surrenders']).each do |snapshot|
        current = graph ? graph.find(Surrender, snapshot['id']) : Surrender.find_by(id: snapshot['id'])
        surrender = current || Surrender.new(snapshot)
        surrender.id = snapshot['id']
        Turbo::StreamsChannel.broadcast_replace_to surrender, target: :surrender_status,
          partial: 'layouts/surrender', locals: { surrender:, revoked: graph ? Array(graph.data['revoked_surrenders']).map(&:to_i).include?(surrender.id) : current.nil? }
      end
      if effects['scoop_id'] && (scoop = graph ? graph.find(Scoop, effects['scoop_id']) : Scoop.find_by(id: effects['scoop_id']))
        if NodeAutomationBackend.enabled?
          NodeAutomationBackend.request('scoop-news', scoop_id: scoop.id, request_key: "social-scoop:#{id}")
        else
          Turbo::StreamsChannel.broadcast_update_to :chyron, target: :chyron, partial: 'application/chyron',
            locals: { message: "Breaking news from #{scoop.user.username}: \"#{scoop.details.truncate_words(6)}...\"" }
          PushNewsJob.perform_later(NewsEntry.from_scoop(scoop).to_json)
        end
      end
      Rails.cache.delete('v2/browselinks') if effects['users'].present?
      update!(delivered_at: Time.current)
    end
  end
end
