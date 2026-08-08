module ApplicationCable
  class Connection < ActionCable::Connection::Base
    attr_accessor :watched_links, :current_user

    def connect
      @watched_links = {}
      @current_user = connection_current_user
    end

    def disconnect
      self.watched_links.each do |link_id, connection_id|
        next unless LinkPresence.leave_id(link_id, connection_id)

        link = Link.find_by(id: link_id)
        next unless link

        link.broadcast_link_page_updates
        ActionCable.server.broadcast("Link::#{link.id}", link.reload.api_payload)
        User.broadcast_api_update(link.user)
      end

      self.watched_links = {}
      self.current_user&.leave_link
    end

    def user_agent
      @request.user_agent
    end

    def client_identity
      [
        @request.user_agent,
        @request.headers['joihow'],
        @request.headers['User_Agent'],
        @request.headers['Wallpaper-Engine-Client'].present? ? "Wallpaper-Engine-Client/#{@request.headers['Wallpaper-Engine-Client']}" : nil
      ].compact_blank.join(' ')
    end

    private

    def connection_current_user
      current_user = User.find(cookies.signed[:permanent_session_id]) if cookies.signed[:permanent_session_id]
      current_user = User.find(@request.session[:user_id]) if @request.session[:user_id]
      if current_user
        current_user
      else
        nil
      end
    end
  end
end
