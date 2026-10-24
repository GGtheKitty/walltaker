module NodeBrowserActions
  extend ActiveSupport::Concern
  included do
    prepend_before_action :prepare_node_browser
    around_action :audit_browser_reads
    rescue_from NodeBrowserBackend::Unavailable do |error|
      render plain: error.message, status: :service_unavailable
    end
    rescue_from NodeBrowserBackend::Rejected do |error|
      if error.status == 429
        response.set_header('Retry-After', '20')
      end
      render plain: error.message, status: error.status
    end
  end

  private

  def prepare_node_browser
    NodeBrowserCurrent.controller = self if NodeBrowserBackend.enabled?
  end
  def node_browser_context
    return @node_browser_context if defined?(@node_browser_context)
    NodeBrowserCurrent.controller = self
    document = NodeBrowserBackend.request('context')
    apply_node_browser_cookies(document)
    @node_browser_context = NodeBrowserBackend::Page.new(document)
  end
  def apply_node_browser_cookies(document)
    if document['clear_legacy']
      cookies.delete(:permanent_session_id, path: '/')
      cookies.delete(:surrender_id, path: '/')
      session.delete(:user_id)
    end
    cookies.delete(:walltaker_session, path: '/') if document['clear_session']
    Array(document['cookies']).each do |item|
      next unless %w[walltaker_session walltaker_csrf].include?(item['name'])
      options = { value: item.fetch('value'), httponly: true, secure: request.ssl?, same_site: :lax, path: '/' }
      options[:expires] = Time.iso8601(item['expires_at']) if item['expires_at']
      cookies[item.fetch('name')] = options
    end
  end
  def node_browser_transition(operation, **input)
    document = NodeBrowserBackend.request(operation, input)
    if document['cookies'] || document['clear_session']
      reset_session
      apply_node_browser_cookies(document)
      @node_browser_context = NodeBrowserBackend::Page.new(document)
      @current_user = @node_browser_context.user
    end
    document
  end
  def browser_page(operation, **input) = NodeBrowserBackend.page(operation, **input)
  def browser_user(identifier, private: false) = NodeBrowserBackend.user(identifier, private:)
  def browser_link(identifier, purpose: 'show') = NodeBrowserBackend.link(identifier, purpose:)
  def browser_surrender_id
    NodeBrowserBackend.enabled? ? current_surrender_session&.id : cookies.signed[:surrender_id]
  end
  def node_browser_authorize(mode)
    return redirect_to(login_path, alert: 'Not authorized') unless current_user
    result = NodeBrowserBackend.request('authorize', mode: mode.to_s)
    return redirect_to(result['redirect'], alert: 'This account is currently surrendered.') if result['redirect']
    true
  rescue NodeBrowserBackend::Rejected => error
    raise unless error.status == 403
    redirect_to(%i[admin lizard].include?(mode) ? root_path : login_path, alert: error.message)
  end
  def verified_request?
    return super unless NodeBrowserBackend.enabled?
    return true unless protect_against_forgery?
    NodeBrowserBackend.request('csrf', tokens: [params[request_forgery_protection_token], request.x_csrf_token]).fetch('verified')
  end
  def form_authenticity_token(form_options: {})
    return super unless NodeBrowserBackend.enabled?
    node_browser_context.data.fetch('csrf_token')
  end
  def audit_browser_reads
    return yield unless NodeBrowserBackend.enabled? && !request.path.start_with?('/_internal/', '/blazer')
    thread = Thread.current; count = 0
    callback = lambda do |*, payload|
      next unless Thread.current == thread
      next if payload[:name] == 'SCHEMA'
      sql = payload[:sql].to_s
      next unless sql.match?(/\A\s*(SELECT|WITH)\b/i)
      count += 1
    end
    ActiveSupport::Notifications.subscribed(callback, 'sql.active_record') { yield }
  ensure
    response.set_header('X-Walltaker-Rails-Reads', count.to_s) if defined?(count) && count
    NodeBrowserCurrent.reset if NodeBrowserBackend.enabled?
  end
end
