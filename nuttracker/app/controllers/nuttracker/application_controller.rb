module Nuttracker
  class ApplicationController < ::ApplicationController
    # These browser-session destinations belong to the host application, while
    # tracker form routes continue to resolve inside the isolated engine.
    delegate :new_session_url, :login_path, :root_path, :surrender_url, to: :main_app

    def authorize
      return redirect_to '/', alert: 'Not authorized' if current_user.nil?
      super
    end
  end
end
