require 'openssl'

class Internal::WallpaperEventsController < ActionController::Base
  skip_forgery_protection
  before_action :authenticate_node

  def create
    NodeWallpaperEvent.find(params[:id]).deliver!
    head :no_content
  end

  private

  def authenticate_node
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:wallpaper-api:events:v1')
    head :forbidden unless ActiveSupport::SecurityUtils.secure_compare(request.headers['Authorization'].to_s, "Bearer #{token}")
  end
end
