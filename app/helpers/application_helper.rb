module ApplicationHelper
  include Pagy::Frontend

  def has_requests?
    if current_user && NodeSocialBackend.enabled?
      @node_friend_requests ||= NodeSocialBackend.request('friend-requests-count', actor_id: current_user.id,
        surrender_id: current_surrender_session&.id).fetch('count')
      return @node_friend_requests.positive?
    end
    return Friendship.all.where(receiver_id: current_user.id, confirmed: false).count.positive? if current_user

    false
  end

  def is_surrender_controller_session?
    return current_surrender_session.present? if NodeBrowserBackend.enabled?
    cookies.signed[:surrender_id].present?
  end

  def walltaker_base_url
    SiteConfig.base_url
  end

  def walltaker_host
    SiteConfig.host
  end

  def walltaker_url(path = nil)
    SiteConfig.url(path)
  end
end
