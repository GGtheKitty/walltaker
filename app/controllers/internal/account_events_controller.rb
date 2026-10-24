require 'openssl'
class Internal::AccountEventsController < ApplicationController
  skip_before_action :disallow_evil_during_invite_only
  skip_before_action :broadcast_flash_message
  skip_forgery_protection
  before_action :authenticate_node
  def create
    NodeAccountEvent.find(params[:id]).deliver!
    head :no_content
  end
  private
  def authenticate_node
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:accounts:events:v1')
    head :forbidden unless ActiveSupport::SecurityUtils.secure_compare(request.headers['Authorization'].to_s, "Bearer #{token}")
  end
end
