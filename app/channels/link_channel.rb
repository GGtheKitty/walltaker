class LinkChannel < ApplicationCable::Channel
  state_attr_accessor :watched_link_id, :watched_user_stream

  def subscribed
    link_identifier = params[:id].presence || params[:link_id].presence
    return reject unless link_identifier

    link = find_link(link_identifier)
    unless link
      transmit({
        success: false,
        why: "Link #{link_identifier} does not exist."
      })
      return
    end

    watch_link(link)
    self.watched_link_id = link.id
    stream_from stream_name(link)
    transmit link.reload.api_payload
  end

  def unsubscribed
    stop_watching_user
    leave_link_id(watched_link_id) if watched_link_id
    self.watched_link_id = nil
  end

  # Invoked by AnyCable after successful native pongs, at most every 30 seconds.
  # Renewal is limited to this connection's server-owned membership tokens.
  def heartbeat
    LinkPresence.refresh_many(connection.watched_links || {})
  end

  def check
    link_identifier = params[:id].presence || params[:link_id].presence
    return unless link_identifier

    link = find_link(link_identifier)
    watch_link(link) if link
  end

  def announce_client(data)
    link_identifier = params[:id].presence || params[:link_id].presence
    client_identity = client_identity_from(data)
    return unless link_identifier && client_identity

    link = find_link(link_identifier)
    if link
      begin
        link.last_ping_user_agent = client_identity
        link.save
      rescue
        { success: false, why: 'bad client name' }
      end
    end
  end

  def watch_user(data)
    username = data['username'].presence
    return transmit_user_error('Missing username.') unless username

    viewer = user_api_viewer(data)
    user = User.find_by(username: username)
    return transmit_user_error("User #{username} does not exist.") unless user

    stop_watching_user
    self.watched_user_stream = user_stream_name(user, viewer)

    stream_from watched_user_stream

    transmit_user_payload(user, viewer)
  end

  def unwatch_user
    stop_watching_user
    transmit({ type: 'user', success: true, watching: false })
  end

  private

  def stream_name(link)
    "Link::#{link.id}"
  end

  def user_stream_name(user, viewer)
    User.api_stream_name(user.username, user.api_audience(viewer))
  end

  def find_link(identifier)
    if identifier.to_s.match?(/\A\d+\z/)
      Link.find_by(id: identifier) || Link.find_by(custom_url: identifier)
    else
      Link.find_by(custom_url: identifier)
    end
  end

  def watch_link(link)
    watched_links = connection.watched_links || {}
    link_key = link.id.to_s
    connection_id = watched_links[link_key] || SecureRandom.uuid
    connection.watched_links = watched_links.merge(link_key => connection_id)
    was_offline = LinkPresence.offline?(link)

    LinkPresence.join(link, connection_id)
    link.live_client_started_at = Time.now.utc if was_offline
    link.last_ping_user_agent = client_identity_from(params) || connection.client_identity
    link.save
  end

  def leave_link_id(link_id)
    watched_links = connection.watched_links || {}
    connection_id = watched_links.delete(link_id.to_s)
    connection.watched_links = watched_links
    return unless connection_id && LinkPresence.leave_id(link_id, connection_id)

    link = Link.find_by(id: link_id)
    return unless link

    broadcast_presence_update(link)
  end

  def broadcast_presence_update(link)
    link.broadcast_link_page_updates
    ActionCable.server.broadcast("Link::#{link.id}", link.reload.api_payload)
    User.broadcast_api_update(link.user)
  end

  def client_identity_from(data)
    data['client'].presence || data['user_agent'].presence || data['userAgent'].presence || data['walltaker_client'].presence || data['walltakerClient'].presence
  end

  def user_api_viewer(data)
    return User.find_by(api_key: data['api_key']) || connection.current_user if data['api_key'].present?

    connection.current_user
  end

  def transmit_user_payload(user, viewer)
    transmit({
      type: 'user',
      success: true,
      watching: true,
      user: user.api_payload(viewer)
    })
  end

  def transmit_user_error(message)
    transmit({
      type: 'user',
      success: false,
      why: message
    })
  end

  def stop_watching_user
    return unless watched_user_stream

    stop_stream_from watched_user_stream
    self.watched_user_stream = nil
  end
end
