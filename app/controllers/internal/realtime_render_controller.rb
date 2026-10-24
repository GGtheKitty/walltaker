require 'openssl'

# Rails renders the existing templates; Node owns presence writes, channel
# authorization, API broadcasts and the retry queue that invokes this adapter.
class Internal::RealtimeRenderController < ApplicationController
  skip_before_action :disallow_evil_during_invite_only
  skip_before_action :broadcast_flash_message
  skip_forgery_protection
  before_action :authenticate_node

  def create
    case params[:kind]
    when 'link'
      if (link = (NodeBrowserBackend.enabled? ? NodeBrowserBackend.graph(links: [params[:id]]).find(Link, params[:id]) : Link.find_by(id: params[:id])))
        Rails.cache.delete('v2/browselinks')
        Rails.cache.delete("v1/user-api/#{link.user.username}/online-links/as-anon")
        Rails.cache.delete("v1/user-api/#{link.user.username}/online-links/as-friend")
        link.broadcast_link_page_updates(raise_on_error: true)
      end
    when 'viewers'
      if (link = (NodeBrowserBackend.enabled? ? NodeBrowserBackend.graph(links: [params[:id]]).find(Link, params[:id]) : Link.find_by(id: params[:id])))
        Turbo::StreamsChannel.broadcast_replace_to "link_viewing_users_#{link.id}", target: "link_viewing_users_#{link.id}",
                                                  partial: 'links/viewing_users', locals: { link: }
      end
    when 'dashboard-viewers'
      Turbo::StreamsChannel.broadcast_replace_to 'dashboard_users_viewing_links', target: 'users_viewing_links',
                                                partial: 'dashboard/users_viewing_links', locals: { users_viewing_links: NodeDiscoveryBackend.enabled? ? NodeDiscoveryBackend.viewing_users : User.active.where.not(viewing_link_id: nil) }
    else
      return head :unprocessable_entity
    end
    head :no_content
  end

  private

  def authenticate_node
    token = OpenSSL::HMAC.hexdigest('SHA256', Rails.application.secret_key_base, 'walltaker:realtime:render:v1')
    head :forbidden unless ActiveSupport::SecurityUtils.secure_compare(request.headers['Authorization'].to_s, "Bearer #{token}")
  end
end
