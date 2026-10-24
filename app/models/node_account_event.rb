require 'openssl'
class NodeAccountEvent < ApplicationRecord
  def deliver!
    with_lock do
      return if delivered_at
      graph = NodeBrowserBackend.event_graph(self) if defined?(NodeBrowserBackend) && NodeBrowserBackend.enabled?
      user = graph ? graph.find(User, user_id) : User.active.find_by(id: user_id)
      user = nil if user&.deleted_at
      if operation == 'reset-request' && graph
        delivery = NodeAccountBackend.request('delivery-user', event_id: id)['delivery']
        if delivery
          recipient = User.instantiate(delivery.fetch('user'))
          PasswordResetMailer.reset_password(recipient, token: delivery.fetch('token')).deliver_now
        end
      elsif operation == 'reset-request'
        if user && result['status'] == 'queued' && user.password_reset_token &&
            user.password_reset_sent_at && user.password_reset_sent_at > 1.hour.ago
          fingerprint = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, "reset:#{user.password_reset_token}")
          if ActiveSupport::SecurityUtils.secure_compare(fingerprint, result['token_fingerprint'].to_s)
            PasswordResetMailer.reset_password(user, token: user.password_reset_token).deliver_now
          end
        end
      else
        Rails.cache.delete('v2/browselinks')
        User.broadcast_api_update_for_username(previous_username) if previous_username
        User.broadcast_api_update(user) if user
        if %w[username account-delete].include?(operation)
          NodeDiscoveryBackend.broadcast_recent_posts if NodeDiscoveryBackend.enabled?
          viewer = user || (graph ? graph.find(User, user_id) : User.find_by(id: user_id))
          if viewer&.viewing_link_id && (viewed_link = graph ? graph.find(Link, viewer.viewing_link_id) : Link.find_by(id: viewer.viewing_link_id))
            Turbo::StreamsChannel.broadcast_replace_to "link_viewing_users_#{viewed_link.id}", target: "link_viewing_users_#{viewed_link.id}",
                                                      partial: 'links/viewing_users', locals: { link: viewed_link }
          end
          NodeRealtime.enqueue('dashboard-viewers:all') if NodeRealtime.enabled?
          (graph ? graph.records('links').where(user_id:) : Link.unscoped.where(user_id:)).find_each do |link|
            if user
              link.broadcast_link_page_updates(raise_on_error: true)
            else
              $redis.del("link:#{link.id}:ws_clients")
              link.broadcast_remove
            end
            link.broadcast_api_update
          end
        end
        (graph ? graph.find(Notification, notification_id) : Notification.find_by(id: notification_id))&.broadcast_updates if notification_id
      end
      update!(delivered_at: Time.current)
    end
  end
end
