class WebPresenceChannel < ApplicationCable::Channel
  def subscribed
    # stream_from "some_channel"
  end

  def unsubscribed
    leave_link
  end

  def view_link(data)
    return unless data['link_id'] && connection.current_user

    link_id = data['link_id'].to_i
    return unless Link.exists?(link_id)

    connection.current_user.view_link(link_id)
  end

  def leave_link
    if connection.current_user
      connection.current_user.leave_link
    end
  end
end
