require 'openssl'

class Internal::WallpaperPresenceController < ApplicationController
  skip_before_action :disallow_evil_during_invite_only
  skip_before_action :broadcast_flash_message
  skip_forgery_protection
  before_action :authenticate_node

  def create
    @link = (NodeBrowserBackend.enabled? ? NodeBrowserBackend.graph(links: [params[:id]]).find(Link, params[:id]) : Link.find_by(id: params[:id]))
    return head :not_found unless @link

    log_link_presence(@link)
    head :no_content
  rescue StandardError => error
    Rails.logger.warn("Wallpaper API presence failed: #{error.class}")
    head :bad_gateway
  end

  private

  def authenticate_node
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:wallpaper-api:presence:v1')
    supplied = request.headers['Authorization'].to_s
    head :forbidden unless ActiveSupport::SecurityUtils.secure_compare(supplied, "Bearer #{token}")
  end
end
