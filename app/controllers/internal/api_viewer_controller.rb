require 'openssl'

class Internal::ApiViewerController < ApplicationController
  skip_before_action :disallow_evil_during_invite_only
  skip_before_action :broadcast_flash_message
  before_action :authenticate_node

  def show
    user = current_user
    user = nil if SiteConfig.invite_only? && user&.evil_account?
    response.headers['Cache-Control'] = 'no-store'
    render json: { user_id: user&.id }
  end

  private

  def authenticate_node
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:wallpaper-api:viewer:v1')
    head :forbidden unless ActiveSupport::SecurityUtils.secure_compare(request.headers['Authorization'].to_s, "Bearer #{token}")
  end
end
