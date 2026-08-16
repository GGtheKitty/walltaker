class LinkChannel < ApplicationCable::Channel
  periodically :refresh_presence, every: 30.seconds

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
    stream_from stream_name(link)
    transmit link.reload.api_payload
  end

  def unsubscribed
    link_identifier = params[:id].presence || params[:link_id].presence
    stop_watching_user
    return unless link_identifier

    link = find_link(link_identifier)
    return unless link

    stop_stream_from stream_name(link)
    leave_link(link)
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
    @watched_user = user
    @watched_user_viewer = viewer
    @watched_user_stream = user_stream_name(user)

    stream_from @watched_user_stream do |_message|
      transmit_user_payload(@watched_user.reload, @watched_user_viewer)
    end

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

  def user_stream_name(user)
    "User::#{user.username}"
  end

  def find_link(identifier)
    if identifier.to_s.match?(/\A\d+\z/)
      Link.find_by(id: identifier) || Link.find_by(custom_url: identifier)
    else
      Link.find_by(custom_url: identifier)
    end
  end

  def watch_link(link)
    connection.watched_links[link.id] ||= SecureRandom.uuid
    LinkPresence.join(link, connection.watched_links[link.id])
    link.live_client_started_at = Time.now.utc
    link.last_ping_user_agent = client_identity_from(params) || connection.client_identity
    link.save
  end

  def refresh_presence
    connection&.watched_links&.each_key do |link_id|
      link = Link.find_by(id: link_id)
      next unless link

      LinkPresence.refresh(link)
      link.update_column(:live_client_started_at, Time.now.utc)
    end
  end

  def leave_link(link)
    connection_id = connection.watched_links.delete(link.id)
    return unless connection_id && LinkPresence.leave(link, connection_id)

    link.live_client_started_at = nil
    link.save
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
    return unless @watched_user_stream

    stop_stream_from @watched_user_stream
    @watched_user_stream = nil
    @watched_user = nil
    @watched_user_viewer = nil
  end
end
